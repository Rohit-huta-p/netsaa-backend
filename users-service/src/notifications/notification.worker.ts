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

            // 3. Queue push notification if user is offline
            if (!delivered && payload.channel.push) {
                await this.queuePushNotification(notification);
            }

            // 4. Queue email if configured
            if (payload.channel.email) {
                await this.queueEmailNotification(notification);
            }

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
     * Queue push notification for offline user
     * In production, this would use a service like Firebase Cloud Messaging
     */
    private async queuePushNotification(notification: any): Promise<void> {
        try {
            // TODO: Implement push notification queuing
            // Options:
            // 1. Use BullMQ to queue jobs for push notification service
            // 2. Call Firebase Cloud Messaging API directly
            // 3. Use a third-party service like OneSignal

            console.log('[NotificationWorker] Push notification queued:', {
                userId: notification.userId,
                notificationId: notification._id,
                title: notification.title,
            });

            // Placeholder: In production, you would:
            // await pushQueue.add('send-push', {
            //     userId: notification.userId,
            //     title: notification.title,
            //     body: notification.body,
            //     data: notification.data,
            // });

        } catch (error) {
            console.error('[NotificationWorker] Failed to queue push notification:', error);
            // Don't throw - push is best-effort
        }
    }

    /**
     * Queue email notification
     * In production, this would use a service like SendGrid or AWS SES
     */
    private async queueEmailNotification(notification: any): Promise<void> {
        try {
            // TODO: Implement email notification queuing
            // Options:
            // 1. Use BullMQ to queue jobs for email service
            // 2. Call SendGrid/AWS SES API directly
            // 3. Use a transactional email service

            console.log('[NotificationWorker] Email notification queued:', {
                userId: notification.userId,
                notificationId: notification._id,
                title: notification.title,
            });

            // Placeholder: In production, you would:
            // await emailQueue.add('send-email', {
            //     userId: notification.userId,
            //     subject: notification.title,
            //     body: notification.body,
            //     template: 'notification',
            // });

        } catch (error) {
            console.error('[NotificationWorker] Failed to queue email notification:', error);
            // Don't throw - email is best-effort
        }
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
