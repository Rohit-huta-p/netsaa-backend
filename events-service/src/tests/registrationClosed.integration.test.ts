/**
 * Tests for the registrationClosed flag:
 *  - live event with registrationClosed:true  → register returns 409 (closed)
 *  - same event with registrationClosed:false → register succeeds (201)
 *  - already-registered user is NOT blocked by the flag (idempotent 200)
 */
import request from 'supertest';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import app from '../server';
import Event from '../models/Event';
import EventRegistration from '../models/EventRegistration';

process.env.JWT_SECRET = 'test-secret';

const userId = new mongoose.Types.ObjectId().toString();
const token = jwt.sign({ id: userId, role: 'artist' }, process.env.JWT_SECRET!);

async function makeLiveEvent(overrides: Record<string, unknown> = {}) {
  return Event.create({
    title: 'Odissi Immersive',
    description: 'Deep-dive into Odissi classical dance',
    eventType: 'workshop',
    category: 'dance',
    organizerId: new mongoose.Types.ObjectId(),
    organizerSnapshot: { name: 'Sonal', organizationName: 'Odissi Kendra' },
    pricingMode: 'fixed',
    ticketPrice: 0,
    schedule: {
      startDate: new Date(Date.now() + 7 * 86400000),
      endDate: new Date(Date.now() + 8 * 86400000),
      totalDurationMinutes: 120,
      dayBreakdown: [],
    },
    location: { type: 'physical', city: 'Bhubaneswar', state: 'OD', country: 'IN' },
    maxParticipants: 30,
    status: 'live',
    capacity: { total: 30, registeredCount: 0 },
    ...overrides,
  });
}

describe('registrationClosed flag — register endpoint', () => {
  it('returns 409 closed when registrationClosed is true', async () => {
    const event = await makeLiveEvent({ registrationClosed: true });

    const res = await request(app)
      .post(`/v1/events/${event._id}/register`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', 'rc-closed-001')
      .send({ quantity: 1, attendees: [{ fullName: 'Aditi', phone: '+919876543210' }] });

    expect(res.status).toBe(409);
    expect(res.body.meta.message).toMatch(/closed/i);
    expect(res.body.data.closed).toBe(true);
    expect(res.body.errors[0].message).toMatch(/host/i);
  });

  it('succeeds (201) when registrationClosed is false', async () => {
    const event = await makeLiveEvent({ registrationClosed: false });

    const res = await request(app)
      .post(`/v1/events/${event._id}/register`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', 'rc-open-001')
      .send({ quantity: 1, attendees: [{ fullName: 'Aditi', phone: '+919876543210' }] });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('registered');
  });

  it('succeeds (200) when registrationClosed is true but user is already registered — idempotent re-check is not blocked', async () => {
    const event = await makeLiveEvent({ registrationClosed: false });

    // First: register while open.
    const first = await request(app)
      .post(`/v1/events/${event._id}/register`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', 'rc-recheck-001')
      .send({ quantity: 1, attendees: [{ fullName: 'Aditi', phone: '+919876543210' }] });
    expect(first.status).toBe(201);

    // Host closes registration.
    await Event.findByIdAndUpdate(event._id, { registrationClosed: true });

    // Already-registered user checks again (same Idempotency-Key) → 200 replay, not 409.
    const replay = await request(app)
      .post(`/v1/events/${event._id}/register`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', 'rc-recheck-001')
      .send({ quantity: 1, attendees: [{ fullName: 'Aditi', phone: '+919876543210' }] });

    // The idempotent early-return (prior && prior.status !== 'cancelled') fires before the
    // registrationClosed guard, so the existing user gets their registration back.
    expect(replay.status).toBe(200);
    expect(replay.body.meta.message).toMatch(/already registered/i);
  });

  it('defaults to registrationClosed:false on a new event', async () => {
    const event = await makeLiveEvent();
    expect((event as any).registrationClosed).toBe(false);
  });
});
