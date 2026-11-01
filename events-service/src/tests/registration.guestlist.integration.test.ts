import request from 'supertest';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import app from '../server';
import Event from '../models/Event';
import EventRegistration from '../models/EventRegistration';
import EventTicket from '../models/EventTicket';

process.env.JWT_SECRET = 'test-secret';

const organizerId = new mongoose.Types.ObjectId();
const hostToken = jwt.sign({ id: organizerId.toString(), role: 'artist' }, process.env.JWT_SECRET);
const tok = (id = new mongoose.Types.ObjectId().toString()) => jwt.sign({ id, role: 'artist' }, process.env.JWT_SECRET!);
const aToken = tok();

async function makeGuestListEvent(maxParticipants = 10, questions: any[] = []) {
  return Event.create({
    title: 'Invite-Only Intensive', description: 'x', eventType: 'workshop', category: 'dance',
    organizerId, organizerSnapshot: { name: 'S', organizationName: '' },
    pricingMode: 'fixed', ticketPrice: 0,
    schedule: { startDate: new Date(Date.now() + 7 * 86400000), endDate: new Date(Date.now() + 8 * 86400000), totalDurationMinutes: 120, dayBreakdown: [] },
    location: { type: 'physical', city: 'Pune', state: 'MH', country: 'IN' },
    maxParticipants, status: 'live',
    registration: { door: 'guest_list', questions },
  });
}

const reqJoin = (eventId: any, token: string, key: string, body: any = {}) =>
  request(app).post(`/v1/events/${eventId}/register`)
    .set('Authorization', `Bearer ${token}`).set('Idempotency-Key', key)
    .send({ quantity: 1, attendees: [{ fullName: 'Guest', phone: '+919876543210' }], ...body });

describe('Guest-list Request-to-join (gap c)', () => {
  it('creates a pending request — no ticket, consumes no seat', async () => {
    const event = await makeGuestListEvent();
    const res = await reqJoin(event._id, aToken, 'gl-1');
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('pending');
    expect(res.body.data.requiresApproval).toBe(true);

    expect(await EventTicket.countDocuments({ registrationId: res.body.data._id })).toBe(0);
    const detail = await request(app).get(`/v1/events/${event._id}`);
    expect(detail.body.data.capacity.registeredCount).toBe(0);
  });

  it('allows a request even when the event is at capacity', async () => {
    const event = await makeGuestListEvent(1);
    // occupy the one seat with an approved request
    const first = await reqJoin(event._id, tok(), 'gl-full-a');
    await request(app).post(`/v1/registrations/${first.body.data._id}/approve`).set('Authorization', `Bearer ${hostToken}`).send({});
    // a second person can still REQUEST (host decides later)
    const res = await reqJoin(event._id, aToken, 'gl-full-b');
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('pending');
  });

  it('host approve → registered + ticket issued + seat consumed', async () => {
    const event = await makeGuestListEvent();
    const reg = await reqJoin(event._id, aToken, 'gl-ap');
    const res = await request(app).post(`/v1/registrations/${reg.body.data._id}/approve`).set('Authorization', `Bearer ${hostToken}`).send({});
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('registered');
    expect(await EventTicket.countDocuments({ registrationId: reg.body.data._id })).toBe(1);
    const detail = await request(app).get(`/v1/events/${event._id}`);
    expect(detail.body.data.capacity.registeredCount).toBe(1);
  });

  it('approve by a non-host → 403', async () => {
    const event = await makeGuestListEvent();
    const reg = await reqJoin(event._id, aToken, 'gl-403');
    const res = await request(app).post(`/v1/registrations/${reg.body.data._id}/approve`).set('Authorization', `Bearer ${aToken}`).send({});
    expect(res.status).toBe(403);
  });

  it('host decline → declined, no ticket', async () => {
    const event = await makeGuestListEvent();
    const reg = await reqJoin(event._id, aToken, 'gl-dec');
    const res = await request(app).post(`/v1/registrations/${reg.body.data._id}/decline`).set('Authorization', `Bearer ${hostToken}`).send({ reason: 'Not a fit' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('declined');
    expect(await EventTicket.countDocuments({ registrationId: reg.body.data._id })).toBe(0);
  });

  it('approving a non-pending request → 409', async () => {
    const event = await makeGuestListEvent();
    const reg = await reqJoin(event._id, aToken, 'gl-409a');
    await request(app).post(`/v1/registrations/${reg.body.data._id}/approve`).set('Authorization', `Bearer ${hostToken}`).send({});
    const again = await request(app).post(`/v1/registrations/${reg.body.data._id}/approve`).set('Authorization', `Bearer ${hostToken}`).send({});
    expect(again.status).toBe(409);
  });

  it('approve is capacity-checked: 409 when the event is full', async () => {
    const event = await makeGuestListEvent(1);
    const a = await reqJoin(event._id, tok(), 'gl-cap-a');
    const b = await reqJoin(event._id, tok(), 'gl-cap-b');
    const okA = await request(app).post(`/v1/registrations/${a.body.data._id}/approve`).set('Authorization', `Bearer ${hostToken}`).send({});
    expect(okA.status).toBe(200);
    const fullB = await request(app).post(`/v1/registrations/${b.body.data._id}/approve`).set('Authorization', `Bearer ${hostToken}`).send({});
    expect(fullB.status).toBe(409);
    expect(fullB.body.meta.message).toMatch(/full/i);
  });

  it('roster surfaces pending requests under `requests`', async () => {
    const event = await makeGuestListEvent();
    await reqJoin(event._id, aToken, 'gl-ros');
    const res = await request(app).get(`/v1/events/${event._id}/roster`).set('Authorization', `Bearer ${hostToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.counts.requests).toBe(1);
    expect(res.body.data.requests[0].status).toBe('pending');
    expect(res.body.data.counts.confirmed).toBe(0);
  });

  it('still enforces required custom-question answers on a request', async () => {
    const event = await makeGuestListEvent(10, [{ label: 'Why you?', type: 'text', required: true }]);
    const res = await reqJoin(event._id, aToken, 'gl-req-q'); // no answers
    expect(res.status).toBe(400);
    expect(res.body.errors[0].message).toMatch(/Why you\?/);
  });

  it('PATCH status fix: `approved` synonym approves (no 500); bogus status → 400', async () => {
    const event = await makeGuestListEvent();
    const reg = await reqJoin(event._id, aToken, 'gl-patch');
    const ok = await request(app).patch(`/v1/registrations/${reg.body.data._id}/status`).set('Authorization', `Bearer ${hostToken}`).send({ status: 'approved' });
    expect(ok.status).toBe(200);
    expect(ok.body.data.status).toBe('registered');
    expect(await EventTicket.countDocuments({ registrationId: reg.body.data._id })).toBe(1);

    const reg2 = await reqJoin(event._id, tok(), 'gl-patch-bad');
    const bad = await request(app).patch(`/v1/registrations/${reg2.body.data._id}/status`).set('Authorization', `Bearer ${hostToken}`).send({ status: 'teleported' });
    expect(bad.status).toBe(400);
  });
});

describe('Open-door registration is unchanged (back-compat)', () => {
  it('registers immediately with a ticket (no pending)', async () => {
    const event = await Event.create({
      title: 'Open Meetup', description: 'x', eventType: 'meetup', category: 'dance',
      organizerId, organizerSnapshot: { name: 'S', organizationName: '' },
      pricingMode: 'fixed', ticketPrice: 0,
      schedule: { startDate: new Date(Date.now() + 7 * 86400000), endDate: new Date(Date.now() + 8 * 86400000), totalDurationMinutes: 120, dayBreakdown: [] },
      location: { type: 'physical', city: 'Pune', state: 'MH', country: 'IN' },
      maxParticipants: 10, status: 'live',
      registration: { door: 'open', questions: [] },
    });
    const res = await reqJoin(event._id, aToken, 'open-1');
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('registered');
    expect(await EventTicket.countDocuments({ registrationId: res.body.data._id })).toBe(1);
  });
});
