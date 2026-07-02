import request from 'supertest';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import app from '../server';
import Event from '../models/Event';
import EventRegistration from '../models/EventRegistration';
import EventTicket from '../models/EventTicket';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

async function makeEvent(over: any = {}) {
  const organizerId = new mongoose.Types.ObjectId().toString();
  const e = await Event.create({
    title: 'Kathak Foundations', description: 'x', eventType: 'workshop', category: 'dance',
    organizerId, organizerSnapshot: { name: 'Saswati', organizationName: 'Sawai' },
    pricingMode: 'fixed', ticketPrice: 0,
    schedule: { startDate: new Date(), endDate: new Date(Date.now() + 7_200_000), totalDurationMinutes: 120, dayBreakdown: [] },
    location: { type: 'physical', city: 'Pune', state: 'MH', country: 'IN' },
    maxParticipants: 24, status: 'live', walkupsAllowed: true, maxGuestsPerRegistration: 5,
    ...over,
  });
  const orgToken = jwt.sign({ id: organizerId, role: 'artist' }, process.env.JWT_SECRET!);
  return { e, organizerId, orgToken };
}

describe('POST /v1/events/:id/walkup', () => {
  it('organizer adds a free walk-up → guest reg (no userId), attended, checked-in ticket', async () => {
    const { e, orgToken } = await makeEvent();
    const res = await request(app).post(`/v1/events/${e._id}/walkup`)
      .set('Authorization', `Bearer ${orgToken}`)
      .send({ fullName: 'Nikhil Sharma', phone: '+919456712345', quantity: 1, payment: 'free' });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('attended');
    const reg = await EventRegistration.findOne({ eventId: e._id, source: 'walkup' });
    expect(reg).toBeTruthy();
    expect(reg?.userId).toBeUndefined();               // guest — no account
    expect(reg?.status).toBe('attended');
    expect(reg?.attendees?.[0]).toMatchObject({ fullName: 'Nikhil Sharma', phone: '+919456712345' });
    expect(reg?.offlinePayment).toBeUndefined();        // free → no payment record
    const ticket = await EventTicket.findOne({ registrationId: reg!._id });
    expect(ticket?.status).toBe('checked_in');
    expect(ticket?.userId).toBeUndefined();
  });

  it('paid event + cash → offlinePayment recorded (no Razorpay, no fee)', async () => {
    const { e, orgToken } = await makeEvent({ pricingMode: 'ticketed', ticketPrice: 4500 });
    const res = await request(app).post(`/v1/events/${e._id}/walkup`)
      .set('Authorization', `Bearer ${orgToken}`)
      .send({ fullName: 'Cash Guest', phone: '+910000000001', quantity: 2, payment: 'cash' });

    expect(res.status).toBe(201);
    const reg = await EventRegistration.findOne({ eventId: e._id, source: 'walkup', 'attendees.fullName': 'Cash Guest' });
    expect(reg?.offlinePayment?.method).toBe('cash');
    expect(reg?.offlinePayment?.amountPaise).toBe(4500 * 2 * 100); // ₹4,500 × 2 seats × 100
    expect(reg?.paymentRecord).toBeUndefined();
  });

  it('two guest walk-ups on one event both succeed (partial index exempts null userId)', async () => {
    const { e, orgToken } = await makeEvent();
    const a = await request(app).post(`/v1/events/${e._id}/walkup`).set('Authorization', `Bearer ${orgToken}`).send({ fullName: 'A', phone: '+911111111111', quantity: 1, payment: 'free' });
    const b = await request(app).post(`/v1/events/${e._id}/walkup`).set('Authorization', `Bearer ${orgToken}`).send({ fullName: 'B', phone: '+912222222222', quantity: 1, payment: 'free' });
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(await EventRegistration.countDocuments({ eventId: e._id, source: 'walkup' })).toBe(2);
  });

  it('guest shows on the roster by name', async () => {
    const { e, orgToken } = await makeEvent();
    await request(app).post(`/v1/events/${e._id}/walkup`).set('Authorization', `Bearer ${orgToken}`).send({ fullName: 'Roster Guest', phone: '+913333333333', quantity: 1, payment: 'free' });
    const roster = await request(app).get(`/v1/events/${e._id}/roster`).set('Authorization', `Bearer ${orgToken}`);
    expect(roster.status).toBe(200);
    expect(roster.body.data.confirmed.map((r: any) => r.name)).toContain('Roster Guest');
  });

  it('403 when a non-organizer tries', async () => {
    const { e } = await makeEvent();
    const other = jwt.sign({ id: new mongoose.Types.ObjectId().toString(), role: 'artist' }, process.env.JWT_SECRET!);
    const res = await request(app).post(`/v1/events/${e._id}/walkup`).set('Authorization', `Bearer ${other}`).send({ fullName: 'N', phone: '+910000000000', quantity: 1, payment: 'free' });
    expect(res.status).toBe(403);
  });

  it('409 when walk-ups are not enabled', async () => {
    const { e, orgToken } = await makeEvent({ walkupsAllowed: false });
    const res = await request(app).post(`/v1/events/${e._id}/walkup`).set('Authorization', `Bearer ${orgToken}`).send({ fullName: 'N', phone: '+910000000000', quantity: 1, payment: 'free' });
    expect(res.status).toBe(409);
  });

  it('409 when capacity is full', async () => {
    const { e, orgToken } = await makeEvent({ maxParticipants: 1 });
    await EventRegistration.create({ eventId: e._id, userId: new mongoose.Types.ObjectId(), quantity: 1, status: 'registered', idempotencyKey: 'fill-1', source: 'standard', visibility: 'public' });
    const res = await request(app).post(`/v1/events/${e._id}/walkup`).set('Authorization', `Bearer ${orgToken}`).send({ fullName: 'N', phone: '+910000000000', quantity: 1, payment: 'free' });
    expect(res.status).toBe(409);
  });

  it('400 when name or phone is missing', async () => {
    const { e, orgToken } = await makeEvent();
    const res = await request(app).post(`/v1/events/${e._id}/walkup`).set('Authorization', `Bearer ${orgToken}`).send({ phone: '+910000000000', quantity: 1, payment: 'free' });
    expect(res.status).toBe(400);
  });
});
