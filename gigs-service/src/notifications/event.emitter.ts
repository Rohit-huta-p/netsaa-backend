/**
 * Event Emitter for Gigs Service Notifications
 * 
 * Simplified event emitter for gigs-service that logs events.
 * In production, this should publish to a message queue (Redis, RabbitMQ, etc.)
 * 
 * Design principles:
 * - Fire-and-forget: Never block business logic
 * - Fail-safe: Errors are logged but never thrown
 * - Type-safe: Uses strict payload shapes
 */

import { Types } from 'mongoose';

/**
 * Event Emitter Class
 * Currently logs events - should be connected to message queue in production
 */
class NotificationEventEmitter {
    /**
     * Emit a notification event
     * Fire-and-forget operation that never blocks
     */
    private emit(eventName: string, payload: any, idempotencyKey: string): void {
        // Fire-and-forget: Don't await, don't block
        this.publishEvent(eventName, payload, idempotencyKey).catch((error) => {
            console.error('[NotificationEventEmitter] Failed to publish event:', {
                eventName,
                error: error.message,
            });
        });
    }

    /**
     * Internal method to publish event
     * This is async but should never be awaited by callers
     */
    private async publishEvent(eventName: string, payload: any, idempotencyKey: string): Promise<void> {
        // TODO: In production, publish to Redis/RabbitMQ/etc
        // For now, just log the event
        console.log('[NotificationEventEmitter] Event:', {
            eventName,
            idempotencyKey,
            payload,
        });
    }

    /**
     * Helper to generate idempotency keys
     */
    private generateIdempotencyKey(eventName: string, primaryEntityId: string): string {
        return `${eventName}:${primaryEntityId}:${Date.now()}`;
    }

    /**
     * Emit gig.application.received event
     */
    emitGigApplicationReceived(payload: {
        gigId: string;
        applicationId: string;
        gigOwnerId: string;
        applicantId: string;
        gigTitle: string;
    }): void {
        this.emit(
            'gig.application.received',
            payload,
            this.generateIdempotencyKey('gig.application.received', payload.applicationId)
        );
    }

    /**
     * Emit gig.application.status.changed event
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
        this.emit(
            'gig.application.status.changed',
            payload,
            this.generateIdempotencyKey(
                'gig.application.status.changed',
                `${payload.applicationId}:${payload.newStatus}`
            )
        );
    }

    /**
     * Emit gig.cancelled event
     */
    emitGigCancelled(payload: {
        gigId: string;
        gigOwnerId: string;
        gigTitle: string;
        applicantIds: string[];
        cancellationReason?: string;
    }): void {
        this.emit(
            'gig.cancelled',
            payload,
            this.generateIdempotencyKey('gig.cancelled', payload.gigId)
        );
    }
}

// Export singleton instance
export const notificationEvents = new NotificationEventEmitter();
