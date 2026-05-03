/**
 * Event Emitter for Gigs Service Notifications
 *
 * Publishes notification events to Redis on the `notification:events`
 * channel — the same channel the users-service NotificationWorker
 * subscribes to. Cross-service: gig events fire here, the worker over
 * in users-service consumes and writes notification rows + fans out
 * to push/email/sms/whatsapp via the channel adapters.
 *
 * Design principles:
 * - Fire-and-forget: never block business logic
 * - Fail-safe: errors are logged but never thrown
 * - Type-safe: strict payload shapes
 *
 * If REDIS_URL isn't set or Redis is unreachable, events are still
 * logged so behaviour stays observable in dev / tests.
 */

import Redis from 'ioredis';

/**
 * Single shared Redis publisher. Created lazily so unit tests that
 * never touch this module don't open a connection. Errors during init
 * fall through to the dev-only console-log path.
 */
let publisher: Redis | null = null;
let publisherInitTried = false;

function getPublisher(): Redis | null {
    if (publisherInitTried) return publisher;
    publisherInitTried = true;
    try {
        const url = process.env.REDIS_URL;
        if (!url) return null;
        publisher = new Redis(url, {
            // Don't crash the process if Redis is unreachable on boot;
            // the publish call itself will surface the error.
            maxRetriesPerRequest: 1,
            lazyConnect: true,
        });
        publisher.connect().catch((err) => {
            console.warn(
                '[NotificationEventEmitter] Redis connect failed (events will console-log only):',
                err?.message ?? err
            );
            publisher = null;
        });
        return publisher;
    } catch (err) {
        console.warn(
            '[NotificationEventEmitter] Redis init failed:',
            err instanceof Error ? err.message : err
        );
        return null;
    }
}

const NOTIFICATION_EVENTS_CHANNEL = 'notification:events';

class NotificationEventEmitter {
    /**
     * Emit a notification event. Publishes to Redis if available, else
     * logs (dev / test mode). Never throws.
     */
    private emit(eventName: string, payload: any, idempotencyKey: string): void {
        const event = { eventName, idempotencyKey, payload };
        const redis = getPublisher();

        if (!redis) {
            // No Redis — keep dev visibility.
            console.log('[NotificationEventEmitter] Event (no redis):', {
                eventName,
                idempotencyKey,
            });
            return;
        }

        redis
            .publish(NOTIFICATION_EVENTS_CHANNEL, JSON.stringify(event))
            .then(() => {
                console.log('[NotificationEventEmitter] Event published:', {
                    eventName,
                    idempotencyKey,
                });
            })
            .catch((err) => {
                // Best-effort: log + move on. Never throw to caller.
                console.error('[NotificationEventEmitter] Failed to publish:', {
                    eventName,
                    error: err?.message ?? err,
                });
            });
    }

    /** Idempotency key: monotonic ms timestamp by default. */
    private generateIdempotencyKey(eventName: string, primaryEntityId: string): string {
        return `${eventName}:${primaryEntityId}:${Date.now()}`;
    }

    /** Day-bucket idempotency for view-tracking events. Same UTC day → same key. */
    private generateDayBucketKey(eventName: string, primaryEntityId: string): string {
        const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
        return `${eventName}:${primaryEntityId}:${today}`;
    }

    /**
     * Emit gig.application.received event
     * Hirer: a new applicant just applied to your gig.
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
     * Emit gig.application.viewed event (Plan 5).
     * Applicant: the hirer just opened your application card.
     *
     * Day-bucket idempotency: a hirer who scrolls back through the
     * applicant list multiple times in a day produces the same key, and
     * the users-service notificationService dedupes on (userId × subtype
     * × entityId) within the last 7 days, so the artist gets at most
     * one notification per (hirer × application × day).
     */
    emitGigApplicationViewed(payload: {
        gigId: string;
        applicationId: string;
        gigOwnerId: string;
        applicantId: string;
        gigTitle: string;
    }): void {
        this.emit(
            'gig.application.viewed',
            payload,
            this.generateDayBucketKey('gig.application.viewed', payload.applicationId)
        );
    }

    /**
     * Emit gig.application.status.changed event
     * Applicant: your application was shortlisted / hired / rejected.
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
