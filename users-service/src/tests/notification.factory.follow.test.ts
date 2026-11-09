// src/tests/notification.factory.follow.test.ts
//
// The notification factory is a pure event→payload transform. These cover the
// two follow-driven events added for the "Follow" feature:
//  - followee.posted  → one notification per follower, gig/event subtype + route
//  - follow.started   → one notification to the followee ("new follower")

import { Types } from 'mongoose';
import { notificationFactory } from '../notifications/notification.factory';
import { NotificationType } from '../notifications/notification.types';
import type { FolloweePostedEvent, FollowStartedEvent } from '../notifications/notification.events';

const oid = () => new Types.ObjectId();

describe('NotificationFactory — follow events', () => {
    it('followee.posted (gig): one notification per follower, gig subtype + gig-details route', () => {
        const actorId = oid();
        const entityId = oid();
        const f1 = oid();
        const f2 = oid();
        const event: FolloweePostedEvent = {
            eventName: 'followee.posted',
            idempotencyKey: 'k',
            payload: {
                actorId,
                actorName: 'Mehfil Collective',
                followerIds: [f1, f2],
                kind: 'gig',
                entityId,
                title: 'Lead dancer — Diwali gala',
            },
        };

        const out = notificationFactory.createFromEvent(event);

        expect(out).toHaveLength(2);
        expect(out[0]).toMatchObject({
            userId: f1,
            actorId,
            type: NotificationType.GIG,
            subtype: 'gig.posted.by_followed',
            entityType: 'gig',
            entityId,
            data: { route: 'gig-details', params: { gigId: entityId.toString() } },
        });
        expect(out[0].body).toContain('Mehfil Collective');
        expect(out[0].body).toContain('Lead dancer — Diwali gala');
        expect(out[0].channel).toMatchObject({ inApp: true, push: true });
        expect(out[1].userId).toBe(f2);
    });

    it('followee.posted (event): event subtype + event-details route; generic fallback body', () => {
        const actorId = oid();
        const entityId = oid();
        const f1 = oid();
        const event: FolloweePostedEvent = {
            eventName: 'followee.posted',
            idempotencyKey: 'k',
            payload: {
                actorId,
                followerIds: [f1], // no actorName
                kind: 'event',
                entityId,
                title: 'Kathak workshop',
            },
        };

        const out = notificationFactory.createFromEvent(event);

        expect(out).toHaveLength(1);
        expect(out[0]).toMatchObject({
            type: NotificationType.EVENT,
            subtype: 'event.posted.by_followed',
            entityType: 'event',
            data: { route: 'event-details', params: { eventId: entityId.toString() } },
        });
        expect(out[0].body).toContain('Someone you follow');
        expect(out[0].body).toContain('an event');
    });

    it('followee.posted: no followers → no notifications', () => {
        const event: FolloweePostedEvent = {
            eventName: 'followee.posted',
            idempotencyKey: 'k',
            payload: { actorId: oid(), followerIds: [], kind: 'gig', entityId: oid(), title: 'x' },
        };
        expect(notificationFactory.createFromEvent(event)).toHaveLength(0);
    });

    it('follow.started: single notification to the followee, FOLLOW type, profile route', () => {
        const recipientId = oid();
        const actorId = oid();
        const event: FollowStartedEvent = {
            eventName: 'follow.started',
            idempotencyKey: 'k',
            payload: { recipientId, actorId },
        };

        const out = notificationFactory.createFromEvent(event);

        expect(out).toHaveLength(1);
        expect(out[0]).toMatchObject({
            userId: recipientId,
            actorId,
            type: NotificationType.FOLLOW,
            subtype: 'follow.started',
            data: { route: 'profile', params: { userId: actorId.toString() } },
        });
    });
});
