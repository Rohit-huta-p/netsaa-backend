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

  it('eventType — comma-separated is an any-of match; a single value still matches exactly', async () => {
    await makeEvent({ eventType: 'workshop' });
    await makeEvent({ eventType: 'audition' });
    await makeEvent({ eventType: 'performance' });

    // Multi-select: any-of across the CSV (the board's searchable multi-select).
    const multi = await request(app).get('/v1/events?eventType=workshop,audition');
    expect(multi.status).toBe(200);
    expect(multi.body.meta.total).toBe(2);
    expect(multi.body.data.every((e: any) => ['workshop', 'audition'].includes(e.eventType))).toBe(true);

    // Single value: still an exact match (split yields a one-element $in).
    const single = await request(app).get('/v1/events?eventType=performance');
    expect(single.body.meta.total).toBe(1);
    expect(single.body.data[0].eventType).toBe('performance');
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

describe('GET /v1/events — text search (q)', () => {
  it('q — matches on title', async () => {
    await makeEvent({ title: 'Salsa Night' });
    await makeEvent({ title: 'Pottery Workshop' });

    const res = await request(app).get('/v1/events?q=salsa');
    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBe(1);
    expect(res.body.data[0].title).toBe('Salsa Night');
  });

  it('q — matches across other text fields and is case-insensitive', async () => {
    await makeEvent({ title: 'Pottery Workshop', about: 'learn basic salsa footwork' });
    await makeEvent({ title: 'Jazz Night' });

    const res = await request(app).get('/v1/events?q=SALSA');
    expect(res.body.meta.total).toBe(1);
    expect(res.body.data[0].title).toBe('Pottery Workshop');
  });

  it('q — matches on nested location fields (venue / city)', async () => {
    await makeEvent({ title: 'Open Mic', location: { type: 'physical', kind: 'in_person', venueName: 'The Salsa Room', city: 'Pune', state: 'MH', country: 'IN' } });
    await makeEvent({ title: 'Open Mic', location: { type: 'physical', kind: 'in_person', venueName: 'The Cellar', city: 'Pune', state: 'MH', country: 'IN' } });

    const res = await request(app).get('/v1/events?q=salsa');
    expect(res.body.meta.total).toBe(1);
    expect(res.body.data[0].location.venueName).toBe('The Salsa Room');
  });

  it('q — special regex characters are escaped (literal match only)', async () => {
    await makeEvent({ title: 'axb' });       // would match /a.b/ if the dot were NOT escaped
    await makeEvent({ title: 'Jam a.b set' }); // the literal we expect to match

    const res = await request(app).get('/v1/events?q=a.b');
    expect(res.body.meta.total).toBe(1);
    expect(res.body.data[0].title).toBe('Jam a.b set');
  });

  it('q — ANDs with other filters (search within the filtered set)', async () => {
    await makeEvent({ title: 'Salsa Night', category: 'dance' });
    await makeEvent({ title: 'Salsa Brunch', category: 'music' });

    const res = await request(app).get('/v1/events?q=salsa&category=dance');
    expect(res.body.meta.total).toBe(1);
    expect(res.body.data[0].category).toBe('dance');
  });
});
