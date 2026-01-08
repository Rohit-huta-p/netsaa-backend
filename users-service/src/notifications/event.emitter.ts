/**
 * Event Emitter for Notification System
 * 
 * This module provides a fire-and-forget event emission system for triggering notifications.
 * Events are published to Redis and consumed by the notification service.
 * 
 * Design principles:
 * - Fire-and-forget: Never block business logic
 * - Fail-safe: Errors are logged but never thrown
 * - Type-safe: Uses strict TypeScript event contracts
 * - Idempotent: Automatic idempotency key generation
 */

import { Redis } from 'ioredis';
import { pubClient } from '../sockets/socket.redis';
import {
    NotificationEvent,
    NotificationEventName,
    generateIdempotencyKey
} from './notification.events';

/**
 * Redis channel for notification events
 * All notification events are published to this channel
 */
const NOTIFICATION_EVENTS_CHANNEL = 'notification:events';

/**
 * Event Emitter Class
 * Handles publishing notification events to Redis
 */
class NotificationEventEmitter {
    private redis: Redis | undefined;

    constructor() {
        this.redis = pubClient;

        if (!this.redis) {
            console.warn(
                '[NotificationEventEmitter] Redis not available. Events will be logged but not published. ' +
                'This is acceptable for local development but should be enabled in production.'
            );
        }
    }

    /**
     * Emit a notification event
     * 
     * This is a fire-and-forget operation. It will:
     * - Generate an idempotency key if not provided
     * - Publish the event to Redis
     * - Log errors but never throw
     * - Return immediately without waiting for Redis
     * 
     * @param event - The notification event to emit
     */
    emit(event: NotificationEvent): void {
        // Fire-and-forget: Don't await, don't block
        this.publishEvent(event).catch((error) => {
            // Log error but never throw to prevent disrupting business logic
            console.error('[NotificationEventEmitter] Failed to publish event:', {
                eventName: event.eventName,
                error: error.message,
            });
        });
    }

    /**
     * Internal method to publish event to Redis
     * This is async but should never be awaited by callers
     */
    private async publishEvent(event: NotificationEvent): Promise<void> {
        if (!this.redis) {
            // Redis not available - log event for debugging
            console.log('[NotificationEventEmitter] Event (not published):', {
                eventName: event.eventName,
                idempotencyKey: event.idempotencyKey,
            });
            return;
        }

        try {
            // Serialize event to JSON
            const eventPayload = JSON.stringify(event);

            // Publish to Redis channel
            await this.redis.publish(NOTIFICATION_EVENTS_CHANNEL, eventPayload);

            console.log('[NotificationEventEmitter] Event published:', {
                eventName: event.eventName,
                idempotencyKey: event.idempotencyKey,
            });
        } catch (error) {
            // Re-throw to be caught by emit() wrapper
            throw error;
        }
    }

    /**
     * Helper method to emit connection.requested event
     */
    emitConnectionRequested(payload: {
        recipientId: string;
        actorId: string;
        connectionId: string;
        message?: string;
    }): void {
        const event: NotificationEvent = {
            eventName: 'connection.requested',
            idempotencyKey: generateIdempotencyKey(
                'connection.requested',
                payload.connectionId
            ),
            payload: {
                recipientId: payload.recipientId as any,
                actorId: payload.actorId as any,
                connectionId: payload.connectionId as any,
                message: payload.message,
            },
        };

        this.emit(event);
    }

    /**
     * Helper method to emit connection.accepted event
     */
    emitConnectionAccepted(payload: {
        recipientId: string;
        actorId: string;
        connectionId: string;
        conversationId: string;
    }): void {
        const event: NotificationEvent = {
            eventName: 'connection.accepted',
            idempotencyKey: generateIdempotencyKey(
                'connection.accepted',
                payload.connectionId
            ),
            payload: {
                recipientId: payload.recipientId as any,
                actorId: payload.actorId as any,
                connectionId: payload.connectionId as any,
                conversationId: payload.conversationId as any,
            },
        };

        this.emit(event);
    }

    /**
     * Helper method to emit message.sent event
     */
    emitMessageSent(payload: {
        conversationId: string;
        messageId: string;
        senderId: string;
        recipientIds: string[];
        messagePreview: string;
        hasAttachments: boolean;
    }): void {
        const event: NotificationEvent = {
            eventName: 'message.sent',
            idempotencyKey: generateIdempotencyKey(
                'message.sent',
                payload.messageId
            ),
            payload: {
                conversationId: payload.conversationId as any,
                messageId: payload.messageId as any,
                senderId: payload.senderId as any,
                recipientIds: payload.recipientIds as any,
                messagePreview: payload.messagePreview,
                hasAttachments: payload.hasAttachments,
            },
        };

        this.emit(event);
    }

    /**
     * Helper method to emit gig.application.received event
     */
    emitGigApplicationReceived(payload: {
        gigId: string;
        applicationId: string;
        gigOwnerId: string;
        applicantId: string;
        gigTitle: string;
    }): void {
        const event: NotificationEvent = {
            eventName: 'gig.application.received',
            idempotencyKey: generateIdempotencyKey(
                'gig.application.received',
                payload.applicationId
            ),
            payload: {
                gigId: payload.gigId as any,
                applicationId: payload.applicationId as any,
                gigOwnerId: payload.gigOwnerId as any,
                applicantId: payload.applicantId as any,
                gigTitle: payload.gigTitle,
            },
        };

        this.emit(event);
    }

    /**
     * Helper method to emit gig.application.status.changed event
     */
    emitGigApplicationStatusChanged(payload: {
        gigId: string;
        applicationId: string;
        applicantId: string;
        gigOwnerId: string;
        gigTitle: string;
        oldStatus: 'pending' | 'shortlisted' | 'hired' | 'rejected';
        newStatus: 'pending' | 'shortlisted' | 'hired' | 'rejected';
    }): void {
        const event: NotificationEvent = {
            eventName: 'gig.application.status.changed',
            idempotencyKey: generateIdempotencyKey(
                'gig.application.status.changed',
                `${payload.applicationId}:${payload.newStatus}`
            ),
            payload: {
                gigId: payload.gigId as any,
                applicationId: payload.applicationId as any,
                applicantId: payload.applicantId as any,
                gigOwnerId: payload.gigOwnerId as any,
                gigTitle: payload.gigTitle,
                oldStatus: payload.oldStatus,
                newStatus: payload.newStatus,
            },
        };

        this.emit(event);
    }

    /**
     * Helper method to emit event.registration.completed event
     */
    emitEventRegistrationCompleted(payload: {
        eventId: string;
        registrationId: string;
        userId: string;
        eventTitle: string;
        eventStartDate: Date;
        ticketCount: number;
        totalAmount: number;
    }): void {
        const event: NotificationEvent = {
            eventName: 'event.registration.completed',
            idempotencyKey: generateIdempotencyKey(
                'event.registration.completed',
                payload.registrationId
            ),
            payload: {
                eventId: payload.eventId as any,
                registrationId: payload.registrationId as any,
                userId: payload.userId as any,
                eventTitle: payload.eventTitle,
                eventStartDate: payload.eventStartDate,
                ticketCount: payload.ticketCount,
                totalAmount: payload.totalAmount,
            },
        };

        this.emit(event);
    }

    /**
     * Helper method to emit event.cancelled event
     */
    emitEventCancelled(payload: {
        eventId: string;
        organizerId: string;
        eventTitle: string;
        registeredUserIds: string[];
        cancellationReason?: string;
        refundAmount?: number;
    }): void {
        const event: NotificationEvent = {
            eventName: 'event.cancelled',
            idempotencyKey: generateIdempotencyKey(
                'event.cancelled',
                payload.eventId
            ),
            payload: {
                eventId: payload.eventId as any,
                organizerId: payload.organizerId as any,
                eventTitle: payload.eventTitle,
                registeredUserIds: payload.registeredUserIds as any,
                cancellationReason: payload.cancellationReason,
                refundAmount: payload.refundAmount,
            },
        };

        this.emit(event);
    }
}

// Export singleton instance
export const notificationEvents = new NotificationEventEmitter();
