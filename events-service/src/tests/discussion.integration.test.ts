import request from 'supertest';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import app from '../server';
import Event from '../models/Event';
import EventRegistration from '../models/EventRegistration';

process.env.JWT_SECRET = 'test-secret';
const tokenFor = (id: string) => jwt.sign({ id, role: 'artist' }, process.env.JWT_SECRET!);

async function event(visibility: 'public' | 'attendees_only') {
  return Event.create({
    title: 'K', description: 'x', eventType: 'workshop', category: 'dance',
    organizerId: new mongoose.Types.ObjectId(), organizerSnapshot: { name: 'S', organizationName: 'Sawai' },
    pricingMode: 'fixed', ticketPrice: 0, discussionVisibility: visibility,
    schedule: { startDate: new Date(Date.now() + 7 * 86400000), endDate: new Date(Date.now() + 8 * 86400000), totalDurationMinutes: 120, dayBreakdown: [] },
    location: { type: 'physical', city: 'Pune', state: 'MH', country: 'IN' }, maxParticipants: 24, status: 'live',
  });
}

describe('GET /v1/events/:eventId/discussion (attendees_only)', () => {
  it('blocks a non-registrant on an attendees_only event', async () => {
    const e = await event('attendees_only');
    const res = await request(app).get(`/v1/events/${e._id}/discussion`).set('Authorization', `Bearer ${tokenFor(new mongoose.Types.ObjectId().toString())}`);
    expect(res.status).toBe(403);
  });
  it('allows a registrant on an attendees_only event', async () => {
    const e = await event('attendees_only');
    const userId = new mongoose.Types.ObjectId().toString();
    await EventRegistration.create({ eventId: e._id, userId, quantity: 1, status: 'registered', idempotencyKey: `k-${userId}`, source: 'standard', visibility: 'public' });
    const res = await request(app).get(`/v1/events/${e._id}/discussion`).set('Authorization', `Bearer ${tokenFor(userId)}`);
    expect(res.status).toBe(200);
  });
  it('allows anyone on a public event', async () => {
    const e = await event('public');
    const res = await request(app).get(`/v1/events/${e._id}/discussion`).set('Authorization', `Bearer ${tokenFor(new mongoose.Types.ObjectId().toString())}`);
    expect(res.status).toBe(200);
  });
});

describe('GET /v1/events/:id/roster/public', () => {
  it('returns only public-visibility registrants (names + avatars, no phone)', async () => {
    const e = await event('public');
    await EventRegistration.create({ eventId: e._id, userId: new mongoose.Types.ObjectId(), quantity: 1, status: 'registered', idempotencyKey: 'pub', source: 'standard', visibility: 'public', attendees: [{ fullName: 'Aditi', phone: '+910000000000' }] });
    await EventRegistration.create({ eventId: e._id, userId: new mongoose.Types.ObjectId(), quantity: 1, status: 'registered', idempotencyKey: 'priv', source: 'standard', visibility: 'private', attendees: [{ fullName: 'Hidden', phone: '+910000000001' }] });
    const res = await request(app).get(`/v1/events/${e._id}/roster/public`);
    expect(res.status).toBe(200);
    expect(res.body.data.count).toBe(1);
    expect(JSON.stringify(res.body.data)).not.toMatch(/910000000000/); // no phone leaked
  });
});
