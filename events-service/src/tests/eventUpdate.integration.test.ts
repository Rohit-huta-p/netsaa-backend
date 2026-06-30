import request from 'supertest';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import app from '../server';
import Event from '../models/Event';

process.env.JWT_SECRET = 'test-secret';

// Two distinct users — owner and a stranger.
const ownerId = new mongoose.Types.ObjectId().toString();
const ownerToken = jwt.sign({ id: ownerId, role: 'artist' }, process.env.JWT_SECRET!);

const strangerId = new mongoose.Types.ObjectId().toString();
const strangerToken = jwt.sign({ id: strangerId, role: 'artist' }, process.env.JWT_SECRET!);

/** Creates a live event whose organizerId matches ownerId (the token's user). */
async function makeOwnerEvent(overrides: Record<string, unknown> = {}) {
  return Event.create({
    title: 'Bharatanatyam Intensive',
    description: 'A deep-dive into Bharatanatyam',
    eventType: 'workshop',
    category: 'dance',
    organizerId: ownerId,                    // ← matches ownerToken
    organizerSnapshot: { name: 'Priya', organizationName: 'Kalakshetra' },
    pricingMode: 'fixed',
    ticketPrice: 0,
    schedule: {
      startDate: new Date(Date.now() + 7 * 86400000),
      endDate: new Date(Date.now() + 8 * 86400000),
      totalDurationMinutes: 120,
      dayBreakdown: [],
    },
    location: { type: 'physical', city: 'Chennai', state: 'TN', country: 'IN' },
    maxParticipants: 30,
    status: 'live',
    visibility: 'public',
    capacity: { total: 30, registeredCount: 0 },
    ...overrides,
  });
}

describe('PATCH /v1/events/:id — owner-gate + field whitelist', () => {
  it('(a) owner can update whitelisted fields: visibility + capacity', async () => {
    const event = await makeOwnerEvent();

    const res = await request(app)
      .patch(`/v1/events/${event._id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ visibility: 'unlisted', capacity: { total: 20 } });

    expect(res.status).toBe(200);
    expect(res.body.data.visibility).toBe('unlisted');
    expect(res.body.data.capacity.total).toBe(20);
  });

  it('(b) non-owner gets 403', async () => {
    const event = await makeOwnerEvent();

    const res = await request(app)
      .patch(`/v1/events/${event._id}`)
      .set('Authorization', `Bearer ${strangerToken}`)
      .send({ visibility: 'private' });

    expect(res.status).toBe(403);
    expect(res.body.meta.message).toBe('Not authorized');
    expect(res.body.errors[0].message).toMatch(/host/i);
  });

  it('(c) non-whitelisted field status is silently ignored (not applied)', async () => {
    const event = await makeOwnerEvent();

    const res = await request(app)
      .patch(`/v1/events/${event._id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      // status and organizerId are NOT on the whitelist
      .send({ title: 'Updated Title', status: 'cancelled', organizerId: strangerId });

    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe('Updated Title');   // whitelisted → applied
    expect(res.body.data.status).toBe('live');            // not whitelisted → ignored
    expect(String(res.body.data.organizerId)).toBe(ownerId); // not whitelisted → ignored

    // Double-check from DB
    const fresh = await Event.findById(event._id);
    expect(fresh!.status).toBe('live');
    expect(String(fresh!.organizerId)).toBe(ownerId);
  });

  it('(d) 404 for non-existent event id', async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app)
      .patch(`/v1/events/${fakeId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ title: 'Ghost' });

    expect(res.status).toBe(404);
  });
});
