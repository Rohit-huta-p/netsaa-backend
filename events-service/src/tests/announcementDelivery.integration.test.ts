// Controller wiring for in-app announcement delivery.
//
// resolveAudience and the users-service client are mocked so this isolates the
// controller's own new logic: resolve the audience → hand it off → stamp the row
// → report delivery HONESTLY (never "sent" when the pipeline didn't accept it).
// The emitter's per-recipient idempotency (the anti-collapse guarantee) is
// unit-tested in users-service; resolveAudience has its own suite.

jest.mock('../services/notificationDispatch', () => ({
  ...jest.requireActual('../services/notificationDispatch'),
  resolveAudience: jest.fn(),
}));
jest.mock('../services/eventAnnounce.client', () => ({
  notifyEventAnnouncement: jest.fn(),
}));

import request from 'supertest';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import app from '../server';
import Event from '../models/Event';
import EventNotification from '../models/EventNotification';
import { resolveAudience } from '../services/notificationDispatch';
import { notifyEventAnnouncement } from '../services/eventAnnounce.client';

const mockResolve = resolveAudience as jest.MockedFunction<typeof resolveAudience>;
const mockClient = notifyEventAnnouncement as jest.MockedFunction<typeof notifyEventAnnouncement>;

process.env.JWT_SECRET = 'test-secret';

async function ownedLiveEvent(orgId: string) {
  return Event.create({
    title: 'Kathak Night', description: 'x', eventType: 'workshop', category: 'dance',
    organizerId: orgId, organizerSnapshot: { name: 'S', organizationName: 'Sawai' },
    pricingMode: 'fixed', ticketPrice: 0,
    schedule: {
      startDate: new Date(Date.now() + 7 * 86400000), endDate: new Date(Date.now() + 8 * 86400000),
      totalDurationMinutes: 120, dayBreakdown: [],
    },
    location: { type: 'physical', city: 'Pune', state: 'MH', country: 'IN' }, capacity: { total: 24 }, status: 'live',
  });
}

describe('POST /v1/events/:id/notifications → in-app delivery wiring', () => {
  beforeEach(() => { mockResolve.mockReset(); mockClient.mockReset(); });

  it('resolves the audience, hands it to the pipeline, and marks the row sent on success', async () => {
    const orgId = new mongoose.Types.ObjectId().toString();
    const orgToken = jwt.sign({ id: orgId, role: 'organizer' }, process.env.JWT_SECRET!);
    const event = await ownedLiveEvent(orgId);

    const ids = [new mongoose.Types.ObjectId().toString(), new mongoose.Types.ObjectId().toString()];
    mockResolve.mockResolvedValue(ids);                       // two attendees
    mockClient.mockResolvedValue({ ok: true, notified: 2 });

    const res = await request(app).post(`/v1/events/${event._id}/notifications`)
      .set('Authorization', `Bearer ${orgToken}`)
      .send({ body: 'Doors at 6', channels: ['push'], audience: 'confirmed' });

    expect(res.status).toBe(201);
    expect(res.body.data.delivered).toBe(true);
    expect(res.body.data.notified).toBe(2);

    // The controller passed the resolved recipients + the host's own message.
    expect(mockClient).toHaveBeenCalledTimes(1);
    const arg = mockClient.mock.calls[0][0];
    expect(arg.recipientIds).toEqual(ids);
    expect(arg.message).toBe('Doors at 6');
    expect(arg.eventTitle).toBe('Kathak Night');
    expect(arg.organizerId).toBe(orgId);

    const row = await EventNotification.findOne({ eventId: event._id, kind: 'announcement' });
    expect(row?.status).toBe('sent');
    expect(row?.sentCount).toBe(2);
  });

  it('keeps the row queued and reports delivered:false when the pipeline is unreachable', async () => {
    const orgId = new mongoose.Types.ObjectId().toString();
    const orgToken = jwt.sign({ id: orgId, role: 'organizer' }, process.env.JWT_SECRET!);
    const event = await ownedLiveEvent(orgId);

    mockResolve.mockResolvedValue(['x']);
    mockClient.mockResolvedValue({ ok: false, notified: 0, reason: 'no_token' }); // e.g. INTERNAL_SERVICE_TOKEN unset

    const res = await request(app).post(`/v1/events/${event._id}/notifications`)
      .set('Authorization', `Bearer ${orgToken}`)
      .send({ body: 'x', channels: ['push'], audience: 'all' });

    expect(res.status).toBe(201);
    expect(res.body.data.delivered).toBe(false);
    expect(res.body.data.reason).toBe('no_token'); // surfaced so the UI can give honest, reason-specific copy

    const row = await EventNotification.findOne({ eventId: event._id, kind: 'announcement' });
    expect(row?.status).toBe('queued'); // NOT 'sent' — we never claim delivery that didn't happen
  });
});
