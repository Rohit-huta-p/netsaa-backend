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

// (tokenFor, fullEvent, app, jwt, mongoose, EventRegistration, WaitlistEntry are all
//  already in scope from the top of this same test file — do not re-import.)

describe('auto-promote on cancel → confirm', () => {
  it('cancelling the lone registration auto-promotes the top waitlister', async () => {
    const event = await fullEvent({ waitlistAutoPromote: true });
    // the seat-filling registration owner:
    const holder = await EventRegistration.findOne({ eventId: event._id });
    // a waitlister:
    const waitUserId = new mongoose.Types.ObjectId().toString();
    await request(app).post(`/v1/events/${event._id}/waitlist/join`).set('Authorization', `Bearer ${tokenFor(waitUserId)}`)
      .send({ quantity: 1, attendeeSnapshot: { fullName: 'Wendy', phone: '+919999999999' } });

    // holder cancels → frees the seat → auto-promote fires
    const holderToken = jwt.sign({ id: holder!.userId!.toString(), role: 'artist' }, process.env.JWT_SECRET!);
    await request(app).post(`/v1/registrations/${holder!._id}/cancel`).set('Authorization', `Bearer ${holderToken}`).send({ reason: 'x' });

    const entry = await WaitlistEntry.findOne({ eventId: event._id, userId: waitUserId });
    expect(entry?.status).toBe('promoted');
    expect(entry?.promotionExpiresAt).toBeTruthy();
  });

  it('confirming a promotion creates a free registration and marks the entry confirmed', async () => {
    const event = await fullEvent({ waitlistAutoPromote: true, pricingMode: 'fixed', ticketPrice: 0 });
    const holder = await EventRegistration.findOne({ eventId: event._id });
    const waitUserId = new mongoose.Types.ObjectId().toString();
    const join = await request(app).post(`/v1/events/${event._id}/waitlist/join`).set('Authorization', `Bearer ${tokenFor(waitUserId)}`)
      .send({ quantity: 1, attendeeSnapshot: { fullName: 'Wendy', phone: '+919999999999' } });
    const holderToken = jwt.sign({ id: holder!.userId!.toString(), role: 'artist' }, process.env.JWT_SECRET!);
    await request(app).post(`/v1/registrations/${holder!._id}/cancel`).set('Authorization', `Bearer ${holderToken}`).send({ reason: 'x' });

    const res = await request(app).post(`/v1/waitlist/${join.body.data.entryId}/confirm`)
      .set('Authorization', `Bearer ${tokenFor(waitUserId)}`).set('Idempotency-Key', 'wl-confirm-1').send({});

    expect(res.status).toBe(201);
    const entry = await WaitlistEntry.findById(join.body.data.entryId);
    expect(entry?.status).toBe('confirmed');
    expect(entry?.registrationId).toBeTruthy();
    expect(await EventRegistration.countDocuments({ eventId: event._id, status: 'registered' })).toBe(1);
  });
});

describe('GET /v1/events/:id/waitlist/me', () => {
  it('returns the active entry (position + status) for a member, 404 otherwise', async () => {
    const event = await fullEvent();
    const userId = new mongoose.Types.ObjectId().toString();
    await request(app).post(`/v1/events/${event._id}/waitlist/join`).set('Authorization', `Bearer ${tokenFor(userId)}`)
      .send({ quantity: 1, attendeeSnapshot: { fullName: 'Aditi', phone: '+919876543210' } });

    const mine = await request(app).get(`/v1/events/${event._id}/waitlist/me`).set('Authorization', `Bearer ${tokenFor(userId)}`);
    expect(mine.status).toBe(200);
    expect(mine.body.data.position).toBe(1);
    expect(mine.body.data.status).toBe('waiting');

    const other = await request(app).get(`/v1/events/${event._id}/waitlist/me`).set('Authorization', `Bearer ${tokenFor(new mongoose.Types.ObjectId().toString())}`);
    expect(other.status).toBe(404);
  });
});
