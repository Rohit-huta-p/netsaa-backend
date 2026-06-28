import request from 'supertest';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import app from '../server';

process.env.JWT_SECRET = 'test-secret';

// In the three-role model (client | creative_lead | artist) there is NO 'organizer'
// role. Events are open to all — any authenticated user can host one.
const artistToken = jwt.sign(
  { id: new mongoose.Types.ObjectId().toString(), role: 'artist' },
  process.env.JWT_SECRET,
);

const validEventBody = () => ({
  title: 'Open Mic Night',
  description: 'Anyone can host an event',
  eventType: 'workshop',
  category: 'dance',
  organizerId: new mongoose.Types.ObjectId().toString(),
  organizerSnapshot: { name: 'Aditi', organizationName: 'Indie Collective' },
  pricingMode: 'fixed',
  ticketPrice: 0,
  schedule: {
    startDate: new Date(Date.now() + 7 * 86400000),
    endDate: new Date(Date.now() + 8 * 86400000),
    totalDurationMinutes: 120,
    dayBreakdown: [],
  },
  location: { type: 'physical', city: 'Pune', state: 'MH', country: 'IN' },
  maxParticipants: 50,
  status: 'live',
});

describe('POST /v1/events — any authenticated user can post an event', () => {
  it('lets an artist (non-organizer role) create an event', async () => {
    const res = await request(app)
      .post('/v1/events')
      .set('Authorization', `Bearer ${artistToken}`)
      .send(validEventBody());

    expect(res.status).toBe(201);
    expect(res.body.data._id).toBeTruthy();
  });

  it('still rejects an unauthenticated request (auth is required, role is not)', async () => {
    const res = await request(app).post('/v1/events').send(validEventBody());
    expect(res.status).toBe(401);
  });
});

describe('POST /v1/events — new composer (EventDoc) payload shape', () => {
  const composerBody = () => ({
    title: 'Kathak Foundations: Footwork & Tatkar',
    about: 'An introductory Kathak session for anyone curious about classical dance.',
    tagline: 'A hands-on morning on rhythm, posture, and the basics of Kathak',
    whatToExpect: 'Warm-up · tatkar · hastas · group practice · Q&A',
    registrationMode: 'free_rsvp',
    startsAt: '2026-07-14T18:30:00.000Z',
    durationKind: 'h2',
    capacity: { total: 20 },
    location: { kind: 'in_person', venueName: 'Nrityangan Studio', address: 'Plot 14, FC Road, Shivajinagar' },
    registrationDeadline: '2026-07-13T18:30:00.000Z',
    requiredAttendeeFields: ['phone', 'email', 'guestNames'],
    maxGuestsPerRegistration: 5,
    allowWaitlist: true, waitlistAutoPromote: false, walkupsAllowed: true,
    discussionVisibility: 'public', visibility: 'public', language: 'en',
    skills: ['kathak'], topicTags: ['kathak', 'classical-dance', 'footwork'],
    media: [{ kind: 'photo', url: 'netsa-fallback', width: 1080, height: 1080, isHero: true, sortOrder: 0 }],
  });

  it('accepts the composer payload and maps it to a valid event', async () => {
    const res = await request(app).post('/v1/events')
      .set('Authorization', `Bearer ${artistToken}`).send(composerBody());
    expect(res.status).toBe(201);
    const id = res.body.data._id;
    expect(id).toBeTruthy();

    const Event = (await import('../models/Event')).default;
    const doc: any = await Event.findById(id);
    expect(doc.description).toBe('An introductory Kathak session for anyone curious about classical dance.'); // about → description (legacy/backend)
    expect(doc.about).toBe('An introductory Kathak session for anyone curious about classical dance.'); // also persisted under new name (detail UI reads event.about)
    expect(doc.maxParticipants).toBe(20);                 // capacity.total → maxParticipants
    expect(doc.schedule.totalDurationMinutes).toBe(120);  // h2 → 120
    expect(new Date(doc.schedule.startDate).toISOString()).toBe('2026-07-14T18:30:00.000Z');
    expect(doc.schedule.endDate.getTime()).toBe(new Date('2026-07-14T18:30:00.000Z').getTime() + 120 * 60000);
    expect(doc.location.type).toBe('physical');           // in_person → physical
    expect(doc.location.venueName).toBe('Nrityangan Studio');
    expect(doc.registrationMode).toBe('free_rsvp');       // persisted new field (frontend reads it)
    expect(doc.capacity.total).toBe(20);                  // persisted new field (frontend reads it)
    expect(String(doc.organizerId)).toBe(JSON.parse(Buffer.from(artistToken.split('.')[1], 'base64').toString()).id); // from auth, not body
  });

  it('defaults free events to ticketPrice 0 / pricingMode fixed', async () => {
    const res = await request(app).post('/v1/events')
      .set('Authorization', `Bearer ${artistToken}`).send(composerBody());
    const Event = (await import('../models/Event')).default;
    const doc: any = await Event.findById(res.body.data._id);
    expect(doc.ticketPrice).toBe(0);
    expect(doc.pricingMode).toBe('fixed');
  });
});
