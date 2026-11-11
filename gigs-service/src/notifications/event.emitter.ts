/**
 * Gigs-service notification event emitter
 *
 * Builds typed notification events and delivers them to the users-service
 * BullMQ queue via the internal HTTP API. Replaces the old console.log stub.
 *
 * Design principles:
 * - Fire-and-forget: callers never await; failures are logged, never thrown
 * - Type-safe: payload shapes match what notification.factory.ts expects
 * - Idempotent: idempotency key format mirrors users-service convention
 *   (`${eventName}:${primaryEntityId}:${timestamp}`)
 */

import { enqueueNotificationEvent } from './notification.client';

class NotificationEventEmitter {
    private emit(eventName: string, payload: Record<string, unknown>, idempotencyKey: string): void {
        enqueueNotificationEvent({ eventName, idempotencyKey, payload }).catch((err) => {
            console.error('[NotificationEventEmitter] Failed to enqueue event:', {
                eventName,
                error: err?.message || err,
            });
        });
    }

    private key(eventName: string, entityId: string): string {
        return `${eventName}:${entityId}:${Date.now()}`;
    }

    emitGigApplicationReceived(payload: {
        gigId: string;
        applicationId: string;
        gigOwnerId: string;
        applicantId: string;
        gigTitle: string;
    }): void {
        this.emit(
            'gig.application.received',
            payload as unknown as Record<string, unknown>,
            this.key('gig.application.received', payload.applicationId)
        );
    }

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
            payload as unknown as Record<string, unknown>,
            this.key('gig.application.status.changed', `${payload.applicationId}:${payload.newStatus}`)
        );
    }

    emitGigCancelled(payload: {
        gigId: string;
        gigOwnerId: string;
        gigTitle: string;
        applicantIds: string[];
        cancellationReason?: string;
    }): void {
        this.emit(
            'gig.cancelled',
            payload as unknown as Record<string, unknown>,
            this.key('gig.cancelled', payload.gigId)
        );
    }
}

export const notificationEvents = new NotificationEventEmitter();
