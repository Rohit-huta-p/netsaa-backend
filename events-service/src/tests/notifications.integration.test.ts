import request from 'supertest';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import app from '../server';
import Event from '../models/Event';
import EventNotification from '../models/EventNotification';

process.env.JWT_SECRET = 'test-secret';
const userId = new mongoose.Types.ObjectId().toString();
const token = jwt.sign({ id: userId, role: 'artist' }, process.env.JWT_SECRET);

describe('GET /v1/users/me/notifications/preferences', () => {
  it('returns sensible defaults when none saved', async () => {
    const res = await request(app).get('/v1/users/me/notifications/preferences').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.reminders.push).toBe(true);
    expect(res.body.data.reminders.sms).toBe(true);
    expect(res.body.data.announcements.sms).toBe(false);
  });
});

describe('PATCH /v1/users/me/notifications/preferences', () => {
  it('updates a single cell and persists', async () => {
    await request(app).patch('/v1/users/me/notifications/preferences')
      .set('Authorization', `Bearer ${token}`).send({ announcements: { sms: true } });
    const res = await request(app).get('/v1/users/me/notifications/preferences').set('Authorization', `Bearer ${token}`);
    expect(res.body.data.announcements.sms).toBe(true);
    expect(res.body.data.reminders.push).toBe(true); // untouched cells preserved
  });
});

describe('POST /v1/events/:id/register → enqueues confirmation notification', () => {
  async function makeFreeEvent() {
    return Event.create({
      title: 'Kathak Foundations', description: 'A week of Kathak', eventType: 'workshop', category: 'dance',
      organizerId: new mongoose.Types.ObjectId(), organizerSnapshot: { name: 'Saswati', organizationName: 'Sawai' },
      pricingMode: 'fixed', ticketPrice: 0,
      schedule: { startDate: new Date(Date.now() + 7 * 86400000), endDate: new Date(Date.now() + 8 * 86400000), totalDurationMinutes: 120, dayBreakdown: [] },
      location: { type: 'physical', city: 'Pune', state: 'MH', country: 'IN' }, maxParticipants: 24, status: 'live',
    });
  }

  it('enqueues a confirmation EventNotification for the registrant', async () => {
    const regUserId = new mongoose.Types.ObjectId().toString();
    const regToken = jwt.sign({ id: regUserId, role: 'artist' }, process.env.JWT_SECRET!);
    const event = await makeFreeEvent();
    const res = await request(app).post(`/v1/events/${event._id}/register`)
      .set('Authorization', `Bearer ${regToken}`)
      .set('Idempotency-Key', `conf-enqueue-${regUserId}`)
      .send({ quantity: 1, attendees: [{ fullName: 'Aditi', phone: '+919876543210' }] });
    expect(res.status).toBe(201);
    const notif = await EventNotification.findOne({ eventId: event._id, kind: 'confirmation', 'customAudienceUserIds': regUserId });
    expect(notif).not.toBeNull();
    expect(notif?.status).toBe('queued');
  });
});

describe('POST /v1/events/:id/notifications (announcement)', () => {
  async function ownedEvent(orgId: string) {
    return Event.create({
      title: 'K', description: 'x', eventType: 'workshop', category: 'dance',
      organizerId: orgId, organizerSnapshot: { name: 'S', organizationName: 'Sawai' },
      pricingMode: 'fixed', ticketPrice: 0,
      schedule: { startDate: new Date(Date.now() + 7 * 86400000), endDate: new Date(Date.now() + 8 * 86400000), totalDurationMinutes: 120, dayBreakdown: [] },
      location: { type: 'physical', city: 'Pune', state: 'MH', country: 'IN' }, maxParticipants: 24, status: 'live',
    });
  }

  it('queues an announcement notification scoped to the chosen audience', async () => {
    const orgId = new mongoose.Types.ObjectId().toString();
    const orgToken = jwt.sign({ id: orgId, role: 'organizer' }, process.env.JWT_SECRET!);
    const event = await ownedEvent(orgId);
    const res = await request(app).post(`/v1/events/${event._id}/notifications`)
      .set('Authorization', `Bearer ${orgToken}`)
      .send({ body: 'Bring your ghungroo', channels: ['push', 'email'], audience: 'confirmed' });

    expect(res.status).toBe(201);
    const row = await EventNotification.findOne({ eventId: event._id, kind: 'announcement' });
    expect(row?.status).toBe('queued');
    expect(row?.channels).toEqual(['push', 'email']);
  });

  it('403s when a non-organizer posts', async () => {
    const event = await ownedEvent(new mongoose.Types.ObjectId().toString());
    const res = await request(app).post(`/v1/events/${event._id}/notifications`)
      .set('Authorization', `Bearer ${token}`).send({ body: 'x', channels: ['push'], audience: 'all' });
    expect(res.status).toBe(403);
  });
});
