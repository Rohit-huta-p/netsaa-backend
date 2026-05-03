/**
 * Notification Worker
 * 
 * Consumes notification events from Redis and processes them.
 * This is the bridge between domain events and user-facing notifications.
 * 
 * Responsibilities:
 * - Subscribe to Redis notification events channel
 * - Transform events to notifications using NotificationFactory
 * - Persist notifications using NotificationService
 * - Deliver notifications via Socket.IO (if user online)
 * - Queue push notifications (if user offline)
 * - Handle failures with retry logic
 * 
 * Design principles:
 * - Stateless: no in-memory state, can be horizontally scaled
 * - Idempotent: duplicate events don't create duplicate notifications
 * - Resilient: failures are logged and retried, never crash the worker
 * - At-least-once delivery: events may be processed multiple times
 */

import { Redis } from 'ioredis';
import { subClient } from '../sockets/socket.redis';
import { getIO } from '../sockets/socket.instance';
import { NotificationEvent } from './notification.events';
import { notificationFactory } from './notification.factory';
import { notificationService } from './notification.service';
import { pushNotificationService } from './push.service';
import { emailNotificationService } from './email.service';
import { smsNotificationService } from './sms.service';
import { whatsappNotificationService } from './whatsapp.service';
import User from '../models/User';

/**
 * Redis channel for notification events
 */
const NOTIFICATION_EVENTS_CHANNEL = 'notification:events';

/**
 * Notification Worker Class
 */
class NotificationWorker {
    private redis: Redis | undefined;
    private isRunning: boolean = false;

    constructor() {
        this.redis = subClient;
    }

    /**
     * Start the worker
     * Subscribes to Redis channel and begins processing events
     */
    async start(): Promise<void> {
        if (this.isRunning) {
            console.log('[NotificationWorker] Already running');
            return;
        }

        if (!this.redis) {
            console.warn(
                '[NotificationWorker] Redis not available. Worker will not start. ' +
                'This is acceptable for local development but should be enabled in production.'
            );
            return;
        }

        try {
            // Subscribe to notification events channel
            await this.redis.subscribe(NOTIFICATION_EVENTS_CHANNEL);
            this.isRunning = true;

            console.log(`[NotificationWorker] Started and subscribed to ${NOTIFICATION_EVENTS_CHANNEL}`);

            // Listen for messages
            this.redis.on('message', (channel, message) => {
                if (channel === NOTIFICATION_EVENTS_CHANNEL) {
                    this.handleEvent(message).catch((error) => {
                        // Log error but don't crash the worker
                        console.error('[NotificationWorker] Failed to handle event:', error);
                    });
                }
            });

            // Handle Redis errors gracefully
            this.redis.on('error', (error) => {
                console.error('[NotificationWorker] Redis error:', error);
                // Don't crash, just log
            });

        } catch (error) {
            console.error('[NotificationWorker] Failed to start:', error);
            this.isRunning = false;
            throw error;
        }
    }

    /**
     * Stop the worker
     * Unsubscribes from Redis channel
     */
    async stop(): Promise<void> {
        if (!this.isRunning || !this.redis) {
            return;
        }

        try {
            await this.redis.unsubscribe(NOTIFICATION_EVENTS_CHANNEL);
            this.isRunning = false;
            console.log('[NotificationWorker] Stopped');
        } catch (error) {
            console.error('[NotificationWorker] Error stopping:', error);
        }
    }

    /**
     * Handle a single notification event
     * This is the main processing pipeline
     */
    private async handleEvent(message: string): Promise<void> {
        try {
            // 1. Parse event
            const event: NotificationEvent = JSON.parse(message);

            console.log('[NotificationWorker] Processing event:', {
                eventName: event.eventName,
                idempotencyKey: event.idempotencyKey,
            });

            // 2. Transform event to notification payload(s)
            const payloads = notificationFactory.createFromEvent(event);

            if (payloads.length === 0) {
                console.warn('[NotificationWorker] No payloads generated for event:', event.eventName);
                return;
            }

            // 3. Process each payload (some events create multiple notifications)
            for (const payload of payloads) {
                await this.processNotification(payload, event.idempotencyKey);
            }

            console.log('[NotificationWorker] Successfully processed event:', event.eventName);

        } catch (error) {
            // Log error with context but don't crash
            console.error('[NotificationWorker] Error handling event:', {
                error: error instanceof Error ? error.message : error,
                message: message.substring(0, 200), // Log first 200 chars
            });

            // In production, you might want to:
            // - Send to dead letter queue
            // - Alert monitoring system
            // - Retry with exponential backoff
            throw error; // Re-throw for potential retry mechanism
        }
    }

    /**
     * Process a single notification payload
     * Persists to DB and delivers via Socket.IO
     */
    private async processNotification(
        payload: any,
        idempotencyKey: string
    ): Promise<void> {
        try {
            // 1. Persist notification to database (idempotent)
            const notification = await notificationService.createNotification(
                payload,
                idempotencyKey
            );

            console.log('[NotificationWorker] Notification persisted:', {
                notificationId: notification._id,
                userId: notification.userId,
                type: notification.type,
                subtype: notification.subtype,
            });

            // 2. Deliver via Socket.IO if user is online
            const delivered = await this.deliverViaSocket(notification);

            // 3. Fan out to non-inApp channels in parallel. Push only fires
            //    when the in-app socket delivery couldn't reach the user
            //    (offline). Email / WhatsApp / SMS are always-on when their
            //    flag is true — they're the cross-app reach for users who
            //    aren't currently in NETSA.
            //
            //    User contact lookup is done once and shared across the
            //    three off-app channels (saves 3x DB hits per notification).
            const offAppNeeded =
                payload.channel.email ||
                payload.channel.sms ||
                payload.channel.whatsapp;

            const userContact = offAppNeeded
                ? await this.lookupUserContact(payload.userId)
                : null;

            await Promise.allSettled([
                !delivered && payload.channel.push
                    ? this.dispatchPush(notification)
                    : Promise.resolve(),
                payload.channel.email && userContact?.email
                    ? this.dispatchEmail(notification, userContact.email)
                    : Promise.resolve(),
                payload.channel.sms && userContact?.phoneNumber
                    ? this.dispatchSms(notification, userContact.phoneNumber)
                    : Promise.resolve(),
                payload.channel.whatsapp && userContact?.phoneNumber
                    ? this.dispatchWhatsApp(notification, userContact.phoneNumber)
                    : Promise.resolve(),
            ]);

        } catch (error) {
            console.error('[NotificationWorker] Error processing notification:', {
                error: error instanceof Error ? error.message : error,
                userId: payload.userId,
                type: payload.type,
            });
            throw error;
        }
    }

    /**
     * Deliver notification via Socket.IO
     * Returns true if user is online and notification was delivered
     */
    private async deliverViaSocket(notification: any): Promise<boolean> {
        try {
            const io = getIO();
            const userId = notification.userId.toString();

            // Emit to user's room (user must join this room on connection)
            // Room name format: `user:${userId}`
            const roomName = `user:${userId}`;

            // Check if user is in the room (i.e., online)
            const sockets = await io.in(roomName).fetchSockets();

            if (sockets.length === 0) {
                // User is offline
                return false;
            }

            // User is online, emit notification
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
            // Socket.IO not initialized or other error
            // This is not critical, just log and continue
            console.warn('[NotificationWorker] Socket.IO delivery failed:', error);
            return false;
        }
    }

    /**
     * One-shot User lookup for the off-app channels. Returns null on any
     * failure (worker keeps going — off-app delivery is best-effort).
     */
    private async lookupUserContact(
        userId: any
    ): Promise<{ email?: string; phoneNumber?: string } | null> {
        try {
            const user = await User.findById(userId)
                .select('email phoneNumber')
                .lean();
            if (!user) return null;
            return {
                email: (user as any).email,
                phoneNumber: (user as any).phoneNumber,
            };
        } catch (err) {
            console.warn(
                '[NotificationWorker] User contact lookup failed:',
                err instanceof Error ? err.message : err
            );
            return null;
        }
    }

    private async dispatchPush(notification: any): Promise<void> {
        // TODO: resolve User.devices[].deviceToken (FCM/APNs token store
        // is not yet modelled on the User schema), then call:
        //   pushNotificationService.send(deviceToken, { title, body, data })
        // for each token. Until the device-token store ships, log the
        // intended dispatch so worker fan-out behaviour is observable.
        try {
            console.log('[NotificationWorker] push dispatch (stub):', {
                userId: notification.userId,
                notificationId: notification._id,
                title: notification.title,
                provider: pushNotificationService.constructor.name,
            });
        } catch (err) {
            console.warn(
                '[NotificationWorker] push dispatch failed:',
                err instanceof Error ? err.message : err
            );
        }
    }

    private async dispatchEmail(
        notification: any,
        toEmail: string
    ): Promise<void> {
        try {
            await emailNotificationService.send({
                userId: notification.userId,
                to: toEmail,
                subject: notification.title,
                body: notification.body,
                ctaUrl: this.buildDeepLink(notification),
                notificationType: notification.subtype,
            });
        } catch (err) {
            console.warn(
                '[NotificationWorker] email dispatch failed:',
                err instanceof Error ? err.message : err
            );
        }
    }

    private async dispatchSms(
        notification: any,
        toPhone: string
    ): Promise<void> {
        try {
            await smsNotificationService.send({
                userId: notification.userId,
                to: toPhone,
                // SMS has a 160-char segment limit — keep it tight.
                body: this.truncate(`${notification.title}: ${notification.body}`, 155),
                notificationType: notification.subtype,
            });
        } catch (err) {
            console.warn(
                '[NotificationWorker] sms dispatch failed:',
                err instanceof Error ? err.message : err
            );
        }
    }

    private async dispatchWhatsApp(
        notification: any,
        toPhone: string
    ): Promise<void> {
        try {
            // Pre-approved templates are required by Meta's WA Business
            // policy; mapping notification.subtype → templateName lives
            // in the provider adapter (mock just logs).
            await whatsappNotificationService.send({
                userId: notification.userId,
                to: toPhone,
                templateName: this.subtypeToWaTemplate(notification.subtype),
                templateVars: [notification.title, notification.body],
                ctaUrl: this.buildDeepLink(notification),
                notificationType: notification.subtype,
            });
        } catch (err) {
            console.warn(
                '[NotificationWorker] whatsapp dispatch failed:',
                err instanceof Error ? err.message : err
            );
        }
    }

    /**
     * Notification subtype → WA template name mapping. Real templates
     * have to be approved by Meta upfront; this map needs to stay in
     * sync with what's been registered. Fallback `netsa_generic`
     * template covers anything not yet mapped.
     */
    private subtypeToWaTemplate(subtype?: string): string {
        if (!subtype) return 'netsa_generic';
        const map: Record<string, string> = {
            'gig.application.shortlisted': 'netsa_gig_shortlisted',
            'gig.application.hired': 'netsa_gig_hired',
            'gig.application.rejected': 'netsa_gig_rejected',
            'gig.application.viewed': 'netsa_gig_application_viewed',
            'profile.viewed': 'netsa_profile_viewed',
        };
        return map[subtype] ?? 'netsa_generic';
    }

    /**
     * Build a netsa.app deep link for the email/WA CTA buttons.
     */
    private buildDeepLink(notification: any): string | undefined {
        const route = notification.data?.route;
        const params = notification.data?.params || {};
        if (!route) return undefined;
        const base = process.env.PUBLIC_APP_BASE_URL || 'https://netsa.app';
        const qs = new URLSearchParams();
        for (const [k, v] of Object.entries(params)) {
            qs.append(k, String(v));
        }
        const qsStr = qs.toString();
        return qsStr ? `${base}/${route}?${qsStr}` : `${base}/${route}`;
    }

    private truncate(s: string, max: number): string {
        return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
    }

    /**
     * Get worker status
     */
    getStatus(): { isRunning: boolean; hasRedis: boolean } {
        return {
            isRunning: this.isRunning,
            hasRedis: !!this.redis,
        };
    }
}

// Export singleton instance
export const notificationWorker = new NotificationWorker();

/**
 * Initialize and start the notification worker
 * Call this from your server startup
 */
export async function startNotificationWorker(): Promise<void> {
    try {
        await notificationWorker.start();
    } catch (error) {
        console.error('[NotificationWorker] Failed to start worker:', error);
        // Don't crash the server, just log the error
    }
}

/**
 * Stop the notification worker
 * Call this during graceful shutdown
 */
export async function stopNotificationWorker(): Promise<void> {
    try {
        await notificationWorker.stop();
    } catch (error) {
        console.error('[NotificationWorker] Failed to stop worker:', error);
    }
}
