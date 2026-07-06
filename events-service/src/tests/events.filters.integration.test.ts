import request from 'supertest';
import mongoose from 'mongoose';
import app from '../server';
import Event from '../models/Event';

process.env.JWT_SECRET = 'test-secret';

const DAY = 86400000;

function makeEvent(over: Record<string, any> = {}) {
  return Event.create({
    title: 'Event',
    description: 'x',
    eventType: 'workshop',
    category: 'dance',
    organizerId: new mongoose.Types.ObjectId(),
    organizerSnapshot: { name: 'O', organizationName: '' },
    pricingMode: 'fixed',
    ticketPrice: 0,
    registrationMode: 'free_rsvp',
    schedule: {
      startDate: new Date(Date.now() + 7 * DAY),
      endDate: new Date(Date.now() + 8 * DAY),
      totalDurationMinutes: 120,
      dayBreakdown: [],
    },
    startsAt: new Date(Date.now() + 7 * DAY),
    location: { type: 'physical', kind: 'in_person', city: 'Pune', state: 'MH', country: 'IN' },
    maxParticipants: 24,
    status: 'live',
    ...over,
  });
}

describe('GET /v1/events — discovery filters', () => {
  it('category — comma-separated is an any-of match', async () => {
    await makeEvent({ category: 'dance' });
    await makeEvent({ category: 'music' });
    await makeEvent({ category: 'theatre' });

    const res = await request(app).get('/v1/events?category=dance,music');
    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBe(2);
    expect(res.body.data.every((e: any) => ['dance', 'music'].includes(e.category))).toBe(true);
  });

  it('format — filters on location.kind (in_person vs online)', async () => {
    await makeEvent({ location: { type: 'physical', kind: 'in_person', city: 'Pune', state: 'MH', country: 'IN' } });
    await makeEvent({ location: { type: 'online', kind: 'online', city: 'Pune', state: 'MH', country: 'IN' } });

    const res = await request(app).get('/v1/events?format=online');
    expect(res.body.meta.total).toBe(1);
    expect(res.body.data[0].location.kind).toBe('online');
  });

  it('price — mode filters on registrationMode (free vs paid)', async () => {
    await makeEvent({ registrationMode: 'free_rsvp' });
    await makeEvent({ registrationMode: 'paid_ticket', pricingMode: 'ticketed', ticketPrice: 500 });

    const res = await request(app).get('/v1/events?mode=paid_ticket');
    expect(res.body.meta.total).toBe(1);
    expect(res.body.data[0].registrationMode).toBe('paid_ticket');
  });

  it('when — startsAfter/startsBefore windows on startsAt', async () => {
    await makeEvent({ startsAt: new Date(Date.now() + 2 * DAY) }); // inside window
    await makeEvent({ startsAt: new Date(Date.now() + 20 * DAY) }); // outside

    const after = new Date(Date.now()).toISOString();
    const before = new Date(Date.now() + 5 * DAY).toISOString();
    const res = await request(app).get(`/v1/events?startsAfter=${after}&startsBefore=${before}`);
    expect(res.body.meta.total).toBe(1);
  });

  it('sort=soonest — orders by startsAt ascending', async () => {
    await makeEvent({ title: 'Later', startsAt: new Date(Date.now() + 30 * DAY) });
    await makeEvent({ title: 'Sooner', startsAt: new Date(Date.now() + 3 * DAY) });

    const res = await request(app).get('/v1/events?sort=soonest');
    expect(res.body.data[0].title).toBe('Sooner');
  });
});
