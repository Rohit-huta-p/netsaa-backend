// Pure unit tests for the event.announcement notification path.
// The BullMQ queue module is mocked so importing the emitter never opens a real
// Redis connection — these run without any infrastructure.

jest.mock('../notifications/notification.queue', () => ({
  enqueueNotificationEvent: jest.fn().mockResolvedValue(undefined),
  NOTIFICATION_QUEUE_NAME: 'notificationQueue',
  NOTIFICATION_JOB_NAME: 'process-event',
  notificationRedisConnection: {},
  notificationQueue: {},
  REDIS_URL: 'redis://localhost:6379',
}));

import { Types } from 'mongoose';
import { notificationFactory } from '../notifications/notification.factory';
import { notificationEvents } from '../notifications/event.emitter';
import { enqueueNotificationEvent } from '../notifications/notification.queue';
import { EventSubtype, NotificationType } from '../notifications/notification.types';

const mockEnqueue = enqueueNotificationEvent as jest.Mock;

describe('notificationFactory · event.announcement', () => {
  it('produces one in-app payload addressed to the attendee, with the host as actor', () => {
    const recipientId = new Types.ObjectId();
    const organizerId = new Types.ObjectId();
    const eventId = new Types.ObjectId();

    const payloads = notificationFactory.createFromEvent({
      eventName: 'event.announcement',
      idempotencyKey: `event.announcement:aid:${recipientId.toString()}`,
      payload: { recipientId, organizerId, eventId, eventTitle: 'Kathak Night', message: 'Doors at 6, arrive early' },
    } as any);

    expect(payloads).toHaveLength(1);
    const p = payloads[0];
    expect(p.userId).toBe(recipientId);
    expect(p.actorId).toBe(organizerId);                 // host is the actor
    expect(p.type).toBe(NotificationType.EVENT);         // lands under the Events tab
    expect(p.subtype).toBe(EventSubtype.ANNOUNCEMENT);
    expect(p.title).toBe('Kathak Night');                // event title leads
    expect(p.body).toBe('Doors at 6, arrive early');     // host's message is the body
    expect(p.channel.inApp).toBe(true);                  // in-app is the channel that delivers
    expect(p.data?.route).toBe('event-details');
    expect(p.data?.params?.eventId).toBe(eventId.toString());
  });

  it('falls back to a sensible title when the event title is empty', () => {
    const payloads = notificationFactory.createFromEvent({
      eventName: 'event.announcement',
      idempotencyKey: 'event.announcement:aid:u1',
      payload: {
        recipientId: new Types.ObjectId(), organizerId: new Types.ObjectId(),
        eventId: new Types.ObjectId(), eventTitle: '', message: 'Hi',
      },
    } as any);
    expect(payloads[0].title).toBe('Event announcement');
  });
});

describe('emitEventAnnouncement · idempotency keys (anti-collapse guarantee)', () => {
  beforeEach(() => mockEnqueue.mockClear());

  it('builds a distinct, stable key per recipient so a fan-out never collapses onto one row', () => {
    const base = { announcementId: 'ann1', organizerId: 'org1', eventId: 'ev1', eventTitle: 'T', message: 'm' };

    notificationEvents.emitEventAnnouncement({ ...base, recipientId: 'userA' });
    notificationEvents.emitEventAnnouncement({ ...base, recipientId: 'userB' });
    notificationEvents.emitEventAnnouncement({ ...base, recipientId: 'userA' }); // retry of the same recipient

    const keys = mockEnqueue.mock.calls.map((c: any[]) => c[0].idempotencyKey);
    expect(keys).toEqual([
      'event.announcement:ann1:userA',
      'event.announcement:ann1:userB',
      'event.announcement:ann1:userA',
    ]);
    // Distinct recipients → distinct keys → one notification row each (the whole
    // point: the worker applies one event's key to every payload, so a shared key
    // would collapse all recipients onto a single row under the unique index).
    expect(keys[0]).not.toBe(keys[1]);
    // Same recipient re-emitted → same key → idempotent (BullMQ + DB both dedup).
    expect(keys[2]).toBe(keys[0]);
  });

  it('uses the queue job id = idempotency key (so the queue dedups too)', () => {
    notificationEvents.emitEventAnnouncement({
      announcementId: 'annX', organizerId: 'o', eventId: 'e', eventTitle: 'T', message: 'm', recipientId: 'uZ',
    });
    const event = mockEnqueue.mock.calls[0][0];
    expect(event.eventName).toBe('event.announcement');
    expect(event.idempotencyKey).toBe('event.announcement:annX:uZ');
    expect(event.payload.recipientId).toBe('uZ');
  });
});
