import request from 'supertest';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import app from '../server';
import Event from '../models/Event';
import EventRegistration from '../models/EventRegistration';
import WaitlistEntry from '../models/WaitlistEntry';

process.env.JWT_SECRET = 'test-secret';
const tokenFor = (id: string) => jwt.sign({ id, role: 'artist' }, process.env.JWT_SECRET!);

async function fullEvent(over: any = {}) {
  const event = await Event.create({
    title: 'Kathak', description: 'x', eventType: 'workshop', category: 'dance',
    organizerId: new mongoose.Types.ObjectId(), organizerSnapshot: { name: 'S', organizationName: 'Sawai' },
    pricingMode: 'fixed', ticketPrice: 4500,
    schedule: { startDate: new Date(Date.now() + 7 * 86400000), endDate: new Date(Date.now() + 8 * 86400000), totalDurationMinutes: 120, dayBreakdown: [] },
    location: { type: 'physical', city: 'Pune', state: 'MH', country: 'IN' },
    maxParticipants: 1, status: 'live', allowWaitlist: true, ...over,
  });
  await EventRegistration.create({ eventId: event._id, userId: new mongoose.Types.ObjectId(), quantity: 1, status: 'registered', idempotencyKey: `fill-${event._id}`, source: 'standard', visibility: 'public' });
  return event;
}

describe('POST /v1/events/:id/waitlist/join', () => {
  it('joins when the event is full, assigning position 1', async () => {
    const event = await fullEvent();
    const userId = new mongoose.Types.ObjectId().toString();
    const res = await request(app).post(`/v1/events/${event._id}/waitlist/join`)
      .set('Authorization', `Bearer ${tokenFor(userId)}`)
      .send({ quantity: 1, attendeeSnapshot: { fullName: 'Aditi', phone: '+919876543210' } });

    expect(res.status).toBe(201);
    expect(res.body.data.position).toBe(1);
    expect(res.body.data.status).toBe('waiting');
  });

  it('409s when seats are still available (just register instead)', async () => {
    const event = await Event.create({
      title: 'Open', description: 'x', eventType: 'workshop', category: 'dance',
      organizerId: new mongoose.Types.ObjectId(), organizerSnapshot: { name: 'S', organizationName: 'Sawai' },
      pricingMode: 'fixed', ticketPrice: 4500,
      schedule: { startDate: new Date(Date.now() + 7 * 86400000), endDate: new Date(Date.now() + 8 * 86400000), totalDurationMinutes: 120, dayBreakdown: [] },
      location: { type: 'physical', city: 'Pune', state: 'MH', country: 'IN' },
      maxParticipants: 10, status: 'live', allowWaitlist: true,
    });
    const res = await request(app).post(`/v1/events/${event._id}/waitlist/join`)
      .set('Authorization', `Bearer ${tokenFor(new mongoose.Types.ObjectId().toString())}`)
      .send({ quantity: 1, attendeeSnapshot: { fullName: 'A', phone: '+910000000000' } });
    expect(res.status).toBe(409);
  });

  it('409s on duplicate join by the same user', async () => {
    const event = await fullEvent();
    const userId = new mongoose.Types.ObjectId().toString();
    const body = { quantity: 1, attendeeSnapshot: { fullName: 'A', phone: '+910000000000' } };
    await request(app).post(`/v1/events/${event._id}/waitlist/join`).set('Authorization', `Bearer ${tokenFor(userId)}`).send(body);
    const dup = await request(app).post(`/v1/events/${event._id}/waitlist/join`).set('Authorization', `Bearer ${tokenFor(userId)}`).send(body);
    expect(dup.status).toBe(409);
  });
});

describe('DELETE /v1/events/:id/waitlist', () => {
  it('marks the user entry declined', async () => {
    const event = await fullEvent();
    const userId = new mongoose.Types.ObjectId().toString();
    await request(app).post(`/v1/events/${event._id}/waitlist/join`).set('Authorization', `Bearer ${tokenFor(userId)}`)
      .send({ quantity: 1, attendeeSnapshot: { fullName: 'A', phone: '+910000000000' } });

    const res = await request(app).delete(`/v1/events/${event._id}/waitlist`).set('Authorization', `Bearer ${tokenFor(userId)}`);
    expect(res.status).toBe(200);
    const entry = await WaitlistEntry.findOne({ eventId: event._id, userId });
    expect(entry?.status).toBe('declined');
  });
});
