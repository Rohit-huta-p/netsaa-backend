/**
 * Notification Worker
 *
 * Consumes notification events from the durable BullMQ queue (notification.queue.ts)
 * and turns them into user-facing notifications.
 *
 * Pipeline per job:
 *   1. Transform the event into notification payload(s) via NotificationFactory
 *   2. Persist each notification via NotificationService (idempotent on the event key)
 *   3. Deliver via Socket.IO if the user is online
 *   4. Best-effort push / email for offline users
 *
 * Design principles:
 * - Durable: jobs survive worker downtime (deploy/restart) — at-least-once delivery
 * - Idempotent: a retried job can't create a duplicate (createNotification dedups
 *   on the event's idempotency key)
 * - Resilient: a thrown error fails the job so BullMQ retries it; the worker process
 *   never crashes
 */

import { Worker, Job } from 'bullmq';
import { getIO } from '../sockets/socket.instance';
import { NotificationEvent } from './notification.events';
import { notificationFactory } from './notification.factory';
import { notificationService } from './notification.service';
import { notificationRedisConnection, NOTIFICATION_QUEUE_NAME } from './notification.queue';

/* ══════════════════════════════════════════
 *  PROCESSING PIPELINE
 * ══════════════════════════════════════════ */

/** Transform one event into notification(s) and process each. Throwing bubbles to
 *  BullMQ, which retries the job per the queue's defaultJobOptions. */
async function handleEvent(event: NotificationEvent): Promise<void> {
    const payloads = notificationFactory.createFromEvent(event);

    if (payloads.length === 0) {
        console.warn('[NotificationWorker] No payloads generated for event:', event.eventName);
        return;
    }

    for (const payload of payloads) {
        await processNotification(payload, event.idempotencyKey);
    }
}

/** Persist one notification payload and deliver it. */
async function processNotification(payload: any, idempotencyKey: string): Promise<void> {
    // 1. Persist (idempotent on idempotencyKey — safe to re-run on retry)
    const notification = await notificationService.createNotification(payload, idempotencyKey);

    console.log('[NotificationWorker] Notification persisted:', {
        notificationId: notification._id,
        userId: notification.userId,
        type: notification.type,
        subtype: notification.subtype,
    });

    // 2. Deliver via Socket.IO if the user is online
    const delivered = await deliverViaSocket(notification);

    // 3. Queue push for offline users (best-effort)
    if (!delivered && payload.channel?.push) {
        await queuePushNotification(notification);
    }

    // 4. Queue email if configured (best-effort)
    if (payload.channel?.email) {
        await queueEmailNotification(notification);
    }
}

/** Deliver via Socket.IO. Returns true if the user was online and received it. */
async function deliverViaSocket(notification: any): Promise<boolean> {
    try {
        const io = getIO();
        const userId = notification.userId.toString();
        const roomName = `user:${userId}`;

        const sockets = await io.in(roomName).fetchSockets();
        if (sockets.length === 0) {
            return false; // offline
        }

        io.to(roomName).emit('notification:new', {
            id: notification._id,
            type: notification.type,
            subtype: notification.subtype,
            title: notification.title,
            body: notification.body,
            data: notification.data,
            createdAt: notification.createdAt,
        });

        console.log('[NotificationWorker] Delivered via Socket.IO:', {
            userId,
            notificationId: notification._id,
            connectedSockets: sockets.length,
        });
        return true;
    } catch (error) {
        // Socket.IO not initialised or other non-critical error — just log
        console.warn('[NotificationWorker] Socket.IO delivery failed:', error);
        return false;
    }
}

/** Queue a push notification for an offline user. Best-effort — never throws. */
async function queuePushNotification(notification: any): Promise<void> {
    try {
        // TODO: wire to FCM / push provider.
        console.log('[NotificationWorker] Push notification queued:', {
            userId: notification.userId,
            notificationId: notification._id,
            title: notification.title,
        });
    } catch (error) {
        console.error('[NotificationWorker] Failed to queue push notification:', error);
    }
}

/** Queue an email notification. Best-effort — never throws. */
async function queueEmailNotification(notification: any): Promise<void> {
    try {
        // TODO: wire to the email queue / provider.
        console.log('[NotificationWorker] Email notification queued:', {
            userId: notification.userId,
            notificationId: notification._id,
            title: notification.title,
        });
    } catch (error) {
        console.error('[NotificationWorker] Failed to queue email notification:', error);
    }
}

/* ══════════════════════════════════════════
 *  WORKER SINGLETON
 * ══════════════════════════════════════════ */

let worker: Worker<NotificationEvent, void, string> | null = null;

/**
 * Initialise and start the notification worker. Call once from server startup.
 * Kept async (resolves when the worker's Redis connection is ready) so existing
 * callers that `.then()` on it keep working.
 */
export async function startNotificationWorker(): Promise<void> {
    if (worker) {
        console.log('[NotificationWorker] Already running');
        return;
    }

    worker = new Worker<NotificationEvent, void, string>(
        NOTIFICATION_QUEUE_NAME,
        async (job: Job<NotificationEvent, void, string>) => {
            console.log('[NotificationWorker] Processing event:', {
                eventName: job.data.eventName,
                idempotencyKey: job.data.idempotencyKey,
                attempt: job.attemptsMade + 1,
            });
            await handleEvent(job.data);
        },
        {
            connection: notificationRedisConnection,
            concurrency: 10,
            stalledInterval: 30_000,
        }
    );

    worker.on('completed', (job) => {
        console.log('[NotificationWorker] ✓ Processed event:', job.data?.eventName);
    });

    worker.on('failed', (job, err) => {
        const attemptsLeft = (job?.opts?.attempts ?? 3) - (job?.attemptsMade ?? 0);
        console.error(
            `[NotificationWorker] ✗ Failed event "${job?.data?.eventName}" id=${job?.id} ` +
            `| attemptsLeft=${attemptsLeft} | reason: ${err.message}`
        );
    });

    // Worker-level Redis/BullMQ errors — log, never crash the process.
    worker.on('error', (err) => {
        console.error('[NotificationWorker] Worker error (non-fatal):', err.message);
    });

    try {
        await worker.waitUntilReady();
        console.log(`[NotificationWorker] Started — listening on "${NOTIFICATION_QUEUE_NAME}" (concurrency=10)`);
    } catch (err: any) {
        // Don't crash the server if Redis isn't reachable; the worker will keep
        // retrying the connection in the background.
        console.error('[NotificationWorker] Failed to become ready:', err?.message);
    }
}

/** Stop the notification worker (graceful shutdown). */
export async function stopNotificationWorker(): Promise<void> {
    if (!worker) return;
    try {
        await worker.close();
        console.log('[NotificationWorker] Stopped');
    } catch (error: any) {
        console.error('[NotificationWorker] Error stopping:', error?.message);
    } finally {
        worker = null;
    }
}

/** Current worker status (used by health checks / tests). */
export function getNotificationWorkerStatus(): { isRunning: boolean } {
    return { isRunning: !!worker };
}
