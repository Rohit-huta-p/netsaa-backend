import { Request, Response } from 'express';
import FollowsService from '../follows/follows.service';
import { notificationEvents, enqueueNotificationEvent } from '../notifications';

// Followers are notified in chunks so a single fan-out never builds an unbounded
// number of notification payloads in one worker job (a popular organizer could
// have tens of thousands of followers).
const FANOUT_CHUNK_SIZE = 500;

/**
 * Internal fan-out endpoint. Called by gigs-service / events-service when an
 * organizer PUBLISHES a gig or event. users-service owns the Follow collection,
 * so it resolves the poster's followers here and emits one `followee.posted`
 * event per chunk; the notification worker turns each into one notification per
 * follower.
 *
 * Contract (POST /internal/notifications/followee-posted, requireServiceToken):
 *   { organizerId, kind: 'gig'|'event', entityId, title, actorName? }
 *
 * Guarantees:
 * - Best-effort for the caller: the posting service treats this as fire-and-forget.
 * - Dedupe: the caller only pings on the first publish (draft→live); per-follower
 *   dedupe in the notification service guards accidental repeats of the same entity.
 * - 200 { notified: 0 } when the poster has no followers (nothing to do).
 */
export async function notifyFolloweePosted(req: Request, res: Response): Promise<void> {
    try {
        const { organizerId, kind, entityId, title, actorName } = req.body || {};

        if (!organizerId || !entityId || (kind !== 'gig' && kind !== 'event')) {
            res.status(400).json({
                error: 'BAD_REQUEST',
                message: 'organizerId, entityId and kind (gig|event) are required',
            });
            return;
        }

        const followerIds = await FollowsService.getFollowerIds(String(organizerId));
        if (followerIds.length === 0) {
            res.status(200).json({ ok: true, notified: 0 });
            return;
        }

        for (let i = 0; i < followerIds.length; i += FANOUT_CHUNK_SIZE) {
            const chunk = followerIds.slice(i, i + FANOUT_CHUNK_SIZE);
            notificationEvents.emitFolloweePosted({
                actorId: String(organizerId),
                actorName: typeof actorName === 'string' ? actorName : undefined,
                followerIds: chunk,
                kind,
                entityId: String(entityId),
                title: typeof title === 'string' ? title : '',
            });
        }

        res.status(202).json({ ok: true, notified: followerIds.length });
    } catch (err: any) {
        // Non-fatal for the caller (notifications are best-effort). Log and 500.
        console.error('[internalNotifications] notifyFolloweePosted failed:', err?.message || err);
        res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
}

/**
 * Generic enqueue endpoint. Called by gigs-service (and future services) to push
 * a NotificationEvent directly onto the BullMQ queue in users-service.
 *
 * Contract (POST /internal/notifications/enqueue, requireServiceToken):
 *   Full NotificationEvent shape: { eventName, idempotencyKey, payload: {...} }
 */
export async function enqueueEvent(req: Request, res: Response): Promise<void> {
    try {
        const event = req.body;

        if (!event?.eventName || !event?.idempotencyKey) {
            res.status(400).json({
                error: 'BAD_REQUEST',
                message: 'eventName and idempotencyKey are required',
            });
            return;
        }

        await enqueueNotificationEvent(event);
        res.status(202).json({ ok: true });
    } catch (err: any) {
        console.error('[internalNotifications] enqueueEvent failed:', err?.message || err);
        res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
}
