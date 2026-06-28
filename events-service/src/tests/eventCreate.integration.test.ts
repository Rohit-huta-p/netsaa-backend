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
