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

async function makeEvent(door: 'apply' | 'guest_list') {
  return Event.create({
    title: `${door} event`, description: 'x', eventType: 'audition', category: 'dance',
    organizerId, organizerSnapshot: { name: 'S', organizationName: '' },
    pricingMode: 'fixed', ticketPrice: 0,
    schedule: { startDate: new Date(Date.now() + 7 * 86400000), endDate: new Date(Date.now() + 8 * 86400000), totalDurationMinutes: 120, dayBreakdown: [] },
    location: { type: 'physical', city: 'Pune', state: 'MH', country: 'IN' },
    maxParticipants: 20, status: 'live',
    registration: { door, questions: [] },
  });
}

const APPLICATION = { pitch: '8 years of Kathak; led 3 productions', links: ['https://youtu.be/reel'], mediaIds: ['media_abc'] };

describe('Apply-with-work (gap d)', () => {
  it('stores the application on a pending apply-door request', async () => {
    const event = await makeEvent('apply');
    const res = await request(app).post(`/v1/events/${event._id}/register`)
      .set('Authorization', `Bearer ${aToken}`).set('Idempotency-Key', 'aw-1')
      .send({ quantity: 1, attendees: [{ fullName: 'Aditi', phone: '+919876543210' }], application: APPLICATION });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('pending');
    const reg = await EventRegistration.findById(res.body.data._id).lean();
    expect(reg?.application).toMatchObject(APPLICATION);
    expect(await EventTicket.countDocuments({ registrationId: res.body.data._id })).toBe(0);
  });

  it('is optional: an apply request without a payload still creates the pending request', async () => {
    const event = await makeEvent('apply');
    const res = await request(app).post(`/v1/events/${event._id}/register`)
      .set('Authorization', `Bearer ${aToken}`).set('Idempotency-Key', 'aw-2')
      .send({ quantity: 1, attendees: [{ fullName: 'Aditi', phone: '+919876543210' }] });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('pending');
    const reg = await EventRegistration.findById(res.body.data._id).lean();
    expect(reg?.application).toBeUndefined();
  });

  it('surfaces the application to the host in the roster requests', async () => {
    const event = await makeEvent('apply');
    await request(app).post(`/v1/events/${event._id}/register`)
      .set('Authorization', `Bearer ${aToken}`).set('Idempotency-Key', 'aw-ros')
      .send({ quantity: 1, attendees: [{ fullName: 'Aditi', phone: '+919876543210' }], application: APPLICATION });

    const res = await request(app).get(`/v1/events/${event._id}/roster`).set('Authorization', `Bearer ${hostToken}`);
    expect(res.body.data.requests[0].application).toMatchObject({ pitch: APPLICATION.pitch });
  });

  it('ignores an application on a non-apply (guest_list) door', async () => {
    const event = await makeEvent('guest_list');
    const res = await request(app).post(`/v1/events/${event._id}/register`)
      .set('Authorization', `Bearer ${aToken}`).set('Idempotency-Key', 'aw-gl')
      .send({ quantity: 1, attendees: [{ fullName: 'Aditi', phone: '+919876543210' }], application: APPLICATION });
    expect(res.status).toBe(201);
    const reg = await EventRegistration.findById(res.body.data._id).lean();
    expect(reg?.application).toBeUndefined();
  });

  it('host approve selects the applicant → registered + ticket (reuses gap c)', async () => {
    const event = await makeEvent('apply');
    const reg = await request(app).post(`/v1/events/${event._id}/register`)
      .set('Authorization', `Bearer ${aToken}`).set('Idempotency-Key', 'aw-approve')
      .send({ quantity: 1, attendees: [{ fullName: 'Aditi', phone: '+919876543210' }], application: APPLICATION });

    const res = await request(app).post(`/v1/registrations/${reg.body.data._id}/approve`).set('Authorization', `Bearer ${hostToken}`).send({});
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('registered');
    expect(await EventTicket.countDocuments({ registrationId: reg.body.data._id })).toBe(1);
  });
});
