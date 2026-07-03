import request from 'supertest';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import app from '../server';
import Event from '../models/Event';
import EventComment from '../models/EventComment';

process.env.JWT_SECRET = 'test-secret';
const tokenFor = (id: string) => jwt.sign({ id, role: 'artist' }, process.env.JWT_SECRET!);

/** attendees_only event with a known organizer — mirrors discussion.integration fixtures. */
async function hostedEvent(over: any = {}) {
  const organizerId = new mongoose.Types.ObjectId().toString();
  const e = await Event.create({
    title: 'K', description: 'x', eventType: 'workshop', category: 'dance',
    organizerId, organizerSnapshot: { name: 'S', organizationName: 'Sawai' },
    pricingMode: 'fixed', ticketPrice: 0, discussionVisibility: 'attendees_only',
    schedule: { startDate: new Date(Date.now() + 7 * 86400000), endDate: new Date(Date.now() + 8 * 86400000), totalDurationMinutes: 120, dayBreakdown: [] },
    location: { type: 'physical', city: 'Pune', state: 'MH', country: 'IN' }, maxParticipants: 24, status: 'live',
    ...over,
  });
  return { e, organizerId, orgToken: tokenFor(organizerId) };
}

describe('host access to own event discussion (organizer exemption)', () => {
  it('organizer GETs discussion on an attendees_only event with no registration → 200', async () => {
    const { e, orgToken } = await hostedEvent();
    const res = await request(app).get(`/v1/events/${e._id}/discussion`).set('Authorization', `Bearer ${orgToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('organizer POSTs a comment on an attendees_only event with no registration → 201', async () => {
    const { e, organizerId, orgToken } = await hostedEvent();
    const res = await request(app).post(`/v1/events/${e._id}/discussion`)
      .set('Authorization', `Bearer ${orgToken}`)
      .send({ text: 'Doors open at 6 — come early!' });
    expect(res.status).toBe(201);
    expect(res.body.data.text).toBe('Doors open at 6 — come early!');
    const stored = await EventComment.findOne({ topicId: e._id, collectionType: 'event' });
    expect(String(stored?.authorId)).toBe(organizerId);
  });

  it('non-organizer, non-registered user on the same event still gets 403 (regression guard)', async () => {
    const { e } = await hostedEvent();
    const stranger = tokenFor(new mongoose.Types.ObjectId().toString());
    const get = await request(app).get(`/v1/events/${e._id}/discussion`).set('Authorization', `Bearer ${stranger}`);
    expect(get.status).toBe(403);
    const post = await request(app).post(`/v1/events/${e._id}/discussion`)
      .set('Authorization', `Bearer ${stranger}`)
      .send({ text: 'let me in' });
    expect(post.status).toBe(403);
    expect(await EventComment.countDocuments({ topicId: e._id })).toBe(0);
  });

  it('organizer GET on a draft event → 200 (status gate skipped for host only)', async () => {
    const { e, orgToken } = await hostedEvent({ status: 'draft' });
    const res = await request(app).get(`/v1/events/${e._id}/discussion`).set('Authorization', `Bearer ${orgToken}`);
    expect(res.status).toBe(200);
  });

  it('non-organizer GET on a draft event still gets 403 (status gate intact)', async () => {
    const { e } = await hostedEvent({ status: 'draft' });
    const stranger = tokenFor(new mongoose.Types.ObjectId().toString());
    const res = await request(app).get(`/v1/events/${e._id}/discussion`).set('Authorization', `Bearer ${stranger}`);
    expect(res.status).toBe(403);
  });
});
