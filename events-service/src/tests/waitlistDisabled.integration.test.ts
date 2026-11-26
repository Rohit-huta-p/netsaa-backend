import request from 'supertest';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import app from '../server';
import Event from '../models/Event';
import EventRegistration from '../models/EventRegistration';
import WaitlistEntry from '../models/WaitlistEntry';

process.env.JWT_SECRET = 'test-secret';
const tokenFor = (id: string) => jwt.sign({ id, role: 'artist' }, process.env.JWT_SECRET!);

/**
 * The waitlist kill-switch in its shipped state: OFF. The global test setup turns it ON
 * for every other suite (so those keep exercising the live paths); here we flip it OFF and
 * assert every READER treats waitlist as disabled — even for an event whose STORED
 * allowWaitlist is still true (the one legacy shape in prod, e.g. Bharatanatyam Foundations).
 */
describe('waitlist disabled (EVENTS_WAITLIST_ENABLED off)', () => {
  const prev = process.env.EVENTS_WAITLIST_ENABLED;
  beforeAll(() => { process.env.EVENTS_WAITLIST_ENABLED = '0'; });
  afterAll(() => { process.env.EVENTS_WAITLIST_ENABLED = prev; });

  async function fullWaitlistEvent(organizerId = new mongoose.Types.ObjectId()) {
    const event = await Event.create({
      title: 'Kathak', description: 'x', eventType: 'workshop', category: 'dance',
      organizerId, organizerSnapshot: { name: 'S', organizationName: 'Sawai' },
      pricingMode: 'fixed', ticketPrice: 0, registrationMode: 'free_rsvp',
      schedule: { startDate: new Date(Date.now() + 7 * 86400000), endDate: new Date(Date.now() + 8 * 86400000), totalDurationMinutes: 120, dayBreakdown: [] },
      location: { type: 'physical', city: 'Pune', state: 'MH', country: 'IN' },
      capacity: { total: 1 }, status: 'live', allowWaitlist: true,
    });
    // Fill the lone seat so the event is genuinely full.
    await EventRegistration.create({ eventId: event._id, userId: new mongoose.Types.ObjectId(), quantity: 1, status: 'registered', idempotencyKey: `fill-${event._id}`, source: 'standard', visibility: 'public' });
    return event;
  }

  const seedWaiter = (eventId: any, userId: any) => WaitlistEntry.create({
    eventId, userId, position: 1, quantity: 1, status: 'waiting', joinedAt: new Date(),
    attendeeSnapshot: { fullName: 'A', phone: '+910000000000' },
  });

  it('join is refused with 409 even on a full allowWaitlist event', async () => {
    const event = await fullWaitlistEvent();
    const res = await request(app).post(`/v1/events/${event._id}/waitlist/join`)
      .set('Authorization', `Bearer ${tokenFor(new mongoose.Types.ObjectId().toString())}`)
      .send({ quantity: 1, attendeeSnapshot: { fullName: 'A', phone: '+910000000000' } });
    expect(res.status).toBe(409);
    expect(res.body.meta.message).toMatch(/disabled/i);
  });

  it('promote is refused with 409 (organizer)', async () => {
    const organizerId = new mongoose.Types.ObjectId();
    const event = await fullWaitlistEvent(organizerId);
    await seedWaiter(event._id, new mongoose.Types.ObjectId());
    const res = await request(app).post(`/v1/events/${event._id}/waitlist/promote`)
      .set('Authorization', `Bearer ${tokenFor(organizerId.toString())}`).send({});
    expect(res.status).toBe(409);
    expect(res.body.meta.message).toMatch(/disabled/i);
  });

  it('GET /waitlist/me returns 404 even when a stored entry exists', async () => {
    const event = await fullWaitlistEvent();
    const userId = new mongoose.Types.ObjectId();
    await seedWaiter(event._id, userId);
    const res = await request(app).get(`/v1/events/${event._id}/waitlist/me`).set('Authorization', `Bearer ${tokenFor(userId.toString())}`);
    expect(res.status).toBe(404);
  });

  it('GET /waitlist/mine returns an empty list despite a stored entry', async () => {
    const event = await fullWaitlistEvent();
    const userId = new mongoose.Types.ObjectId();
    await seedWaiter(event._id, userId);
    const res = await request(app).get('/v1/waitlist/mine').set('Authorization', `Bearer ${tokenFor(userId.toString())}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('event detail serializes allowWaitlist:false even when stored true', async () => {
    const event = await fullWaitlistEvent();
    const res = await request(app).get(`/v1/events/${event._id}`);
    expect(res.status).toBe(200);
    expect(res.body.data.allowWaitlist).toBe(false);
  });

  it('register on a full event reports waitlistAvailable:false', async () => {
    const event = await fullWaitlistEvent();
    const res = await request(app).post(`/v1/events/${event._id}/register`)
      .set('Authorization', `Bearer ${tokenFor(new mongoose.Types.ObjectId().toString())}`).set('Idempotency-Key', 'wl-off-reg')
      .send({ quantity: 1, attendees: [{ fullName: 'A', phone: '+910000000000' }] });
    expect(res.status).toBe(409);
    expect(res.body.data.waitlistAvailable).toBe(false);
  });

  it('host roster omits the waitlist bucket (empty + count 0) despite a stored entry', async () => {
    const organizerId = new mongoose.Types.ObjectId();
    const event = await fullWaitlistEvent(organizerId);
    await seedWaiter(event._id, new mongoose.Types.ObjectId());
    const res = await request(app).get(`/v1/events/${event._id}/roster`).set('Authorization', `Bearer ${tokenFor(organizerId.toString())}`);
    expect(res.status).toBe(200);
    expect(res.body.data.waitlist).toEqual([]);
    expect(res.body.data.counts.waitlist).toBe(0);
  });
});
