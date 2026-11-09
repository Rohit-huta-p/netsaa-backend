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

import {
    NotificationEvent,
    NotificationEventName,
    generateIdempotencyKey
} from './notification.events';
import { enqueueNotificationEvent } from './notification.queue';

/**
 * Event Emitter Class
 * Enqueues notification events onto a durable BullMQ queue (notification.queue.ts).
 * The Worker (notification.worker.ts) consumes them at-least-once, so an event is
 * never lost if the worker is briefly down (deploy / restart / crash) — unlike the
 * old Redis pub/sub, which only reached subscribers connected at publish time.
 */
class NotificationEventEmitter {
    /**
     * Emit a notification event.
     *
     * Fire-and-forget: enqueues the event for durable processing and returns
     * immediately. Errors are logged, never thrown, so notifications can never
     * disrupt the business logic that triggered them.
     */
    emit(event: NotificationEvent): void {
        enqueueNotificationEvent(event).catch((error) => {
            console.error('[NotificationEventEmitter] Failed to enqueue event:', {
                eventName: event.eventName,
                idempotencyKey: event.idempotencyKey,
                error: error?.message,
            });
        });
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

    /**
     * Helper to emit followee.posted event (a followed user/org published a
     * gig or event). `followerIds` are the recipients — the caller (the internal
     * endpoint) resolves them from the Follow collection and chunks large sets,
     * emitting one event per chunk.
     */
    emitFolloweePosted(payload: {
        actorId: string;
        actorName?: string;
        followerIds: string[];
        kind: 'gig' | 'event';
        entityId: string;
        title: string;
    }): void {
        const event: NotificationEvent = {
            eventName: 'followee.posted',
            idempotencyKey: generateIdempotencyKey(
                'followee.posted',
                `${payload.kind}:${payload.entityId}`
            ),
            payload: {
                actorId: payload.actorId as any,
                actorName: payload.actorName,
                followerIds: payload.followerIds as any,
                kind: payload.kind,
                entityId: payload.entityId as any,
                title: payload.title,
            },
        };

        this.emit(event);
    }

    /**
     * Helper to emit follow.started event (someone started following a user/org).
     */
    emitFollowStarted(payload: {
        recipientId: string;
        actorId: string;
    }): void {
        const event: NotificationEvent = {
            eventName: 'follow.started',
            idempotencyKey: generateIdempotencyKey(
                'follow.started',
                `${payload.actorId}:${payload.recipientId}`
            ),
            payload: {
                recipientId: payload.recipientId as any,
                actorId: payload.actorId as any,
            },
        };

        this.emit(event);
    }
}

// Export singleton instance
export const notificationEvents = new NotificationEventEmitter();
