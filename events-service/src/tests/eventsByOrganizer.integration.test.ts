import request from 'supertest';
import mongoose from 'mongoose';
import app from '../server';
import Event from '../models/Event';

process.env.JWT_SECRET = 'test-secret';

const orgA = new mongoose.Types.ObjectId();
const orgB = new mongoose.Types.ObjectId();

function makeEvent(
  organizerId: mongoose.Types.ObjectId,
  title: string,
  status: 'live' | 'draft',
) {
  return Event.create({
    title,
    description: 'x',
    eventType: 'workshop',
    category: 'dance',
    organizerId,
    organizerSnapshot: { name: 'Org', organizationName: '' },
    pricingMode: 'fixed',
    ticketPrice: 0,
    schedule: {
      startDate: new Date(Date.now() + 7 * 86400000),
      endDate: new Date(Date.now() + 8 * 86400000),
      totalDurationMinutes: 120,
      dayBreakdown: [],
    },
    location: { type: 'physical', city: 'Pune', state: 'MH', country: 'IN' },
    maxParticipants: 24,
    status,
  });
}

describe('GET /v1/events?organizerId — public "more by organizer"', () => {
  it("returns only the given organizer's LIVE events (excludes other organizers and drafts)", async () => {
    await makeEvent(orgA, 'A live 1', 'live');
    await makeEvent(orgA, 'A live 2', 'live');
    await makeEvent(orgA, 'A draft', 'draft'); // excluded — status defaults to live (no draft leak)
    await makeEvent(orgB, 'B live', 'live'); // excluded — different organizer

    const res = await request(app).get(`/v1/events?organizerId=${orgA.toString()}`);

    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBe(2);
    const titles = res.body.data.map((e: any) => e.title).sort();
    expect(titles).toEqual(['A live 1', 'A live 2']);
    expect(res.body.data.every((e: any) => String(e.organizerId) === orgA.toString())).toBe(true);
  });

  it('without organizerId, does not filter by organizer', async () => {
    await makeEvent(orgA, 'A live', 'live');
    await makeEvent(orgB, 'B live', 'live');

    const res = await request(app).get('/v1/events');

    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBe(2);
  });
});
