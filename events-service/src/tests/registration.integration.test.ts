import request from 'supertest';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import app from '../server';
import Event from '../models/Event';
import EventRegistration from '../models/EventRegistration';
import EventTicket from '../models/EventTicket';

process.env.JWT_SECRET = 'test-secret';

const userId = new mongoose.Types.ObjectId().toString();
const token = jwt.sign({ id: userId, role: 'artist' }, process.env.JWT_SECRET);

async function makeFreeEvent() {
  return Event.create({
    title: 'Kathak Foundations',
    description: 'A week of Kathak',
    eventType: 'workshop',
    category: 'dance',
    organizerId: new mongoose.Types.ObjectId(),
    organizerSnapshot: { name: 'Saswati', organizationName: 'Sawai' },
    pricingMode: 'fixed',
    ticketPrice: 0,
    schedule: { startDate: new Date(Date.now() + 7 * 86400000), endDate: new Date(Date.now() + 8 * 86400000), totalDurationMinutes: 120, dayBreakdown: [] },
    location: { type: 'physical', city: 'Pune', state: 'MH', country: 'IN' },
    maxParticipants: 24,
    status: 'live',
  });
}

describe('POST /v1/events/:id/register (free RSVP)', () => {
  it('creates a registration + one ticket per attendee', async () => {
    const event = await makeFreeEvent();
    const res = await request(app)
      .post(`/v1/events/${event._id}/register`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', 'idem-aaa')
      .send({ quantity: 1, attendees: [{ fullName: 'Aditi', phone: '+919876543210' }] });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('registered');

    const tickets = await EventTicket.find({ registrationId: res.body.data._id });
    expect(tickets).toHaveLength(1);
    expect(tickets[0].qrCode).toBeTruthy();
  });

  it('is idempotent: same Idempotency-Key returns the same registration', async () => {
    const event = await makeFreeEvent();
    const payload = { quantity: 1, attendees: [{ fullName: 'Aditi', phone: '+919876543210' }] };

    const first = await request(app).post(`/v1/events/${event._id}/register`)
      .set('Authorization', `Bearer ${token}`).set('Idempotency-Key', 'idem-bbb').send(payload);
    const replay = await request(app).post(`/v1/events/${event._id}/register`)
      .set('Authorization', `Bearer ${token}`).set('Idempotency-Key', 'idem-bbb').send(payload);

    expect(replay.body.data._id).toBe(first.body.data._id);
    expect(await EventRegistration.countDocuments({ eventId: event._id })).toBe(1);
  });

  it('rejects when registration deadline has passed', async () => {
    const event = await makeFreeEvent();
    event.registrationDeadline = new Date(Date.now() - 3600000);
    await event.save();

    const res = await request(app).post(`/v1/events/${event._id}/register`)
      .set('Authorization', `Bearer ${token}`).set('Idempotency-Key', 'idem-ccc')
      .send({ quantity: 1, attendees: [{ fullName: 'Aditi', phone: '+919876543210' }] });

    expect(res.status).toBe(409);
    expect(res.body.meta.message).toMatch(/closed/i);
  });
});

describe('GET /v1/registrations/:id/ticket', () => {
  it('returns ticketCode, backupCode, qrPayload for the owner', async () => {
    const event = await makeFreeEvent();
    const reg = await request(app).post(`/v1/events/${event._id}/register`)
      .set('Authorization', `Bearer ${token}`).set('Idempotency-Key', 'idem-tkt')
      .send({ quantity: 1, attendees: [{ fullName: 'Aditi', phone: '+919876543210' }] });

    const res = await request(app)
      .get(`/v1/registrations/${reg.body.data._id}/ticket`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.ticketCode).toMatch(/^KF-/);
    expect(res.body.data.backupCode).toMatch(/^\d{6}$/);
    expect(res.body.data.qrPayload).toContain('|');
  });

  it('403s for a non-owner', async () => {
    const event = await makeFreeEvent();
    const reg = await request(app).post(`/v1/events/${event._id}/register`)
      .set('Authorization', `Bearer ${token}`).set('Idempotency-Key', 'idem-tkt2')
      .send({ quantity: 1, attendees: [{ fullName: 'Aditi', phone: '+919876543210' }] });

    const otherToken = jwt.sign({ id: new mongoose.Types.ObjectId().toString(), role: 'artist' }, process.env.JWT_SECRET!);
    const res = await request(app)
      .get(`/v1/registrations/${reg.body.data._id}/ticket`)
      .set('Authorization', `Bearer ${otherToken}`);

    expect(res.status).toBe(403);
  });
});

describe('POST /v1/events/:id/check-in', () => {
  it('marks the ticket checked_in and registration attended', async () => {
    const event = await makeFreeEvent();
    const reg = await request(app).post(`/v1/events/${event._id}/register`)
      .set('Authorization', `Bearer ${token}`).set('Idempotency-Key', 'idem-ci')
      .send({ quantity: 1, attendees: [{ fullName: 'Aditi', phone: '+919876543210' }] });

    const ticket = await request(app).get(`/v1/registrations/${reg.body.data._id}/ticket`)
      .set('Authorization', `Bearer ${token}`);

    const res = await request(app)
      .post(`/v1/events/${event._id}/check-in`)
      .set('Authorization', `Bearer ${token}`)
      .send({ code: ticket.body.data.ticketCode, method: 'qr' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('checked_in');
  });

  it('rejects a second check-in of the same ticket', async () => {
    const event = await makeFreeEvent();
    const reg = await request(app).post(`/v1/events/${event._id}/register`)
      .set('Authorization', `Bearer ${token}`).set('Idempotency-Key', 'idem-ci2')
      .send({ quantity: 1, attendees: [{ fullName: 'Aditi', phone: '+919876543210' }] });
    const ticket = await request(app).get(`/v1/registrations/${reg.body.data._id}/ticket`)
      .set('Authorization', `Bearer ${token}`);

    await request(app).post(`/v1/events/${event._id}/check-in`).set('Authorization', `Bearer ${token}`)
      .send({ code: ticket.body.data.ticketCode, method: 'qr' });
    const second = await request(app).post(`/v1/events/${event._id}/check-in`).set('Authorization', `Bearer ${token}`)
      .send({ code: ticket.body.data.ticketCode, method: 'qr' });

    expect(second.status).toBe(409);
    expect(second.body.meta.message).toMatch(/already/i);
  });
});
