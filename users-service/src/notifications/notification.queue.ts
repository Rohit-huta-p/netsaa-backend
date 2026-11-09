/* ─────────────────────────────────────────────
 *  notification.queue.ts
 *  Durable BullMQ queue for notification events (PRODUCER side).
 *
 *  Replaces the old Redis pub/sub emit path. Pub/sub only reached subscribers
 *  connected at publish time, so any event fired while the worker was down
 *  (deploy / restart / crash) was lost forever. A BullMQ job persists in Redis
 *  until a worker picks it up → at-least-once delivery.
 *
 *  Connects to REDIS_URL directly (same as the email queue), so it does NOT
 *  depend on ENABLE_SOCKET_REDIS — toggling the socket.io adapter can no longer
 *  silently kill notifications.
 *
 *  The Worker (consumer) lives in notification.worker.ts.
 * ───────────────────────────────────────────── */

import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { NotificationEvent } from './notification.events';

export const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

/* Dedicated connection for the notification queue/worker.
 * maxRetriesPerRequest: null is required by BullMQ. */
export const notificationRedisConnection = new IORedis(REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
});

notificationRedisConnection.on('error', (err) =>
    console.error('[NotificationQueue] Redis connection error:', err.message)
);

export const NOTIFICATION_QUEUE_NAME = 'notificationQueue';
export const NOTIFICATION_JOB_NAME = 'process-event';

export const notificationQueue = new Queue<NotificationEvent, void, string>(NOTIFICATION_QUEUE_NAME, {
    connection: notificationRedisConnection,
    defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5_000 }, // 5s → 25s → 125s
        removeOnComplete: { count: 1_000 },
        removeOnFail: { count: 500 },
    },
});

/**
 * Enqueue a notification event for durable, at-least-once processing.
 *
 * The job id is the event's idempotency key, which gives queue-level dedup and a
 * stable id for retries/tracing; the DB write is idempotent on the same key too,
 * so a retried job can never create a duplicate notification.
 */
export async function enqueueNotificationEvent(event: NotificationEvent): Promise<void> {
    await notificationQueue.add(NOTIFICATION_JOB_NAME, event, { jobId: event.idempotencyKey });
}
