import request from 'supertest';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import app from '../server';
import Event from '../models/Event';
import EventRegistration from '../models/EventRegistration';
import EventTicket from '../models/EventTicket';
import User from '../models/User';
import WaitlistEntry from '../models/WaitlistEntry';

process.env.JWT_SECRET = 'test-secret';

const userId = new mongoose.Types.ObjectId().toString();
const token = jwt.sign({ id: userId, role: 'artist' }, process.env.JWT_SECRET);

async function makeFreeEvent() {
  return Event.create({
    title: 'Kathak Foundations',
    description: 'A week of Kathak',
    eventType: 'workshop',
    category: 'dance',
    organizerId: new mongoose.Types.ObjectId(),
    organizerSnapshot: { name: 'Saswati', organizationName: 'Sawai' },
    pricingMode: 'fixed',
    ticketPrice: 0,
    schedule: { startDate: new Date(Date.now() + 7 * 86400000), endDate: new Date(Date.now() + 8 * 86400000), totalDurationMinutes: 120, dayBreakdown: [] },
    location: { type: 'physical', city: 'Pune', state: 'MH', country: 'IN' },
    maxParticipants: 24,
    status: 'live',
  });
}

describe('POST /v1/events/:id/register (free RSVP)', () => {
  it('creates a registration + one ticket per attendee', async () => {
    const event = await makeFreeEvent();
    const res = await request(app)
      .post(`/v1/events/${event._id}/register`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', 'idem-aaa')
      .send({ quantity: 1, attendees: [{ fullName: 'Aditi', phone: '+919876543210' }] });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('registered');

    const tickets = await EventTicket.find({ registrationId: res.body.data._id });
    expect(tickets).toHaveLength(1);
    expect(tickets[0].qrCode).toBeTruthy();
  });

  it('is idempotent: same Idempotency-Key returns the same registration', async () => {
    const event = await makeFreeEvent();
    const payload = { quantity: 1, attendees: [{ fullName: 'Aditi', phone: '+919876543210' }] };

    const first = await request(app).post(`/v1/events/${event._id}/register`)
      .set('Authorization', `Bearer ${token}`).set('Idempotency-Key', 'idem-bbb').send(payload);
    const replay = await request(app).post(`/v1/events/${event._id}/register`)
      .set('Authorization', `Bearer ${token}`).set('Idempotency-Key', 'idem-bbb').send(payload);

    expect(replay.body.data._id).toBe(first.body.data._id);
    expect(await EventRegistration.countDocuments({ eventId: event._id })).toBe(1);
  });

  it('rejects when registration deadline has passed', async () => {
    const event = await makeFreeEvent();
    event.registrationDeadline = new Date(Date.now() - 3600000);
    await event.save();

    const res = await request(app).post(`/v1/events/${event._id}/register`)
      .set('Authorization', `Bearer ${token}`).set('Idempotency-Key', 'idem-ccc')
      .send({ quantity: 1, attendees: [{ fullName: 'Aditi', phone: '+919876543210' }] });

    expect(res.status).toBe(409);
    expect(res.body.meta.message).toMatch(/closed/i);
  });
});

describe('GET /v1/registrations/:id/ticket', () => {
  it('returns ticketCode, backupCode, qrPayload for the owner', async () => {
    const event = await makeFreeEvent();
    const reg = await request(app).post(`/v1/events/${event._id}/register`)
      .set('Authorization', `Bearer ${token}`).set('Idempotency-Key', 'idem-tkt')
      .send({ quantity: 1, attendees: [{ fullName: 'Aditi', phone: '+919876543210' }] });

    const res = await request(app)
      .get(`/v1/registrations/${reg.body.data._id}/ticket`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.ticketCode).toMatch(/^KF-/);
    expect(res.body.data.backupCode).toMatch(/^\d{6}$/);
    expect(res.body.data.qrPayload).toContain('|');
  });

  it('403s for a non-owner', async () => {
    const event = await makeFreeEvent();
    const reg = await request(app).post(`/v1/events/${event._id}/register`)
      .set('Authorization', `Bearer ${token}`).set('Idempotency-Key', 'idem-tkt2')
      .send({ quantity: 1, attendees: [{ fullName: 'Aditi', phone: '+919876543210' }] });

    const otherToken = jwt.sign({ id: new mongoose.Types.ObjectId().toString(), role: 'artist' }, process.env.JWT_SECRET!);
    const res = await request(app)
      .get(`/v1/registrations/${reg.body.data._id}/ticket`)
      .set('Authorization', `Bearer ${otherToken}`);

    expect(res.status).toBe(403);
  });
});

describe('POST /v1/events/:id/check-in', () => {
  it('marks the ticket checked_in and registration attended', async () => {
    const event = await makeFreeEvent();
    const reg = await request(app).post(`/v1/events/${event._id}/register`)
      .set('Authorization', `Bearer ${token}`).set('Idempotency-Key', 'idem-ci')
      .send({ quantity: 1, attendees: [{ fullName: 'Aditi', phone: '+919876543210' }] });

    const ticket = await request(app).get(`/v1/registrations/${reg.body.data._id}/ticket`)
      .set('Authorization', `Bearer ${token}`);

    const res = await request(app)
      .post(`/v1/events/${event._id}/check-in`)
      .set('Authorization', `Bearer ${token}`)
      .send({ code: ticket.body.data.ticketCode, method: 'qr' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('checked_in');
  });

  it('rejects a second check-in of the same ticket', async () => {
    const event = await makeFreeEvent();
    const reg = await request(app).post(`/v1/events/${event._id}/register`)
      .set('Authorization', `Bearer ${token}`).set('Idempotency-Key', 'idem-ci2')
      .send({ quantity: 1, attendees: [{ fullName: 'Aditi', phone: '+919876543210' }] });
    const ticket = await request(app).get(`/v1/registrations/${reg.body.data._id}/ticket`)
      .set('Authorization', `Bearer ${token}`);

    await request(app).post(`/v1/events/${event._id}/check-in`).set('Authorization', `Bearer ${token}`)
      .send({ code: ticket.body.data.ticketCode, method: 'qr' });
    const second = await request(app).post(`/v1/events/${event._id}/check-in`).set('Authorization', `Bearer ${token}`)
      .send({ code: ticket.body.data.ticketCode, method: 'qr' });

    expect(second.status).toBe(409);
    expect(second.body.meta.message).toMatch(/already/i);
  });
});

describe('POST /v1/events/:id/register — idempotent per user (re-RSVP)', () => {
  it('returns the existing registration (200, not 400) when re-submitting with a new key', async () => {
    const event = await makeFreeEvent();
    const first = await request(app).post(`/v1/events/${event._id}/register`)
      .set('Authorization', `Bearer ${token}`).set('Idempotency-Key', 'rsvp-k1')
      .send({ quantity: 1, attendees: [{ fullName: 'Aditi', phone: '+919876543210' }] });
    expect(first.status).toBe(201);

    const again = await request(app).post(`/v1/events/${event._id}/register`)
      .set('Authorization', `Bearer ${token}`).set('Idempotency-Key', 'rsvp-k2-different')
      .send({ quantity: 1, attendees: [{ fullName: 'Aditi', phone: '+919876543210' }] });

    expect(again.status).toBe(200);
    expect(String(again.body.data._id)).toBe(String(first.body.data._id));
    expect(await EventRegistration.countDocuments({ eventId: event._id })).toBe(1);
  });

  it('reactivates a cancelled registration on re-RSVP (status back to registered, no 400)', async () => {
    const event = await makeFreeEvent();
    const first = await request(app).post(`/v1/events/${event._id}/register`)
      .set('Authorization', `Bearer ${token}`).set('Idempotency-Key', 'rsvp-c1')
      .send({ quantity: 1, attendees: [{ fullName: 'Aditi', phone: '+919876543210' }] });
    await EventRegistration.findByIdAndUpdate(first.body.data._id, { status: 'cancelled' });

    const rejoin = await request(app).post(`/v1/events/${event._id}/register`)
      .set('Authorization', `Bearer ${token}`).set('Idempotency-Key', 'rsvp-c2')
      .send({ quantity: 1, attendees: [{ fullName: 'Aditi', phone: '+919876543210' }] });

    expect(rejoin.status).toBe(200);
    expect(rejoin.body.data.status).toBe('registered');
    expect(await EventRegistration.countDocuments({ eventId: event._id })).toBe(1);
  });
});

describe('GET /v1/events/:id/registrations/me', () => {
  it('returns the user\'s active registration after they register', async () => {
    const event = await makeFreeEvent();
    const reg = await request(app).post(`/v1/events/${event._id}/register`)
      .set('Authorization', `Bearer ${token}`).set('Idempotency-Key', 'me-1')
      .send({ quantity: 1, attendees: [{ fullName: 'Aditi', phone: '+919876543210' }] });
    const res = await request(app).get(`/v1/events/${event._id}/registrations/me`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(String(res.body.data._id)).toBe(String(reg.body.data._id));
    expect(res.body.data.ticketCode).toBeTruthy();
  });
  it('404s when the user is not registered', async () => {
    const event = await makeFreeEvent();
    const res = await request(app).get(`/v1/events/${event._id}/registrations/me`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});

describe('GET /v1/events/:id — live capacity.registeredCount', () => {
  it('reflects registered seats (sum of quantity), not the stored 0', async () => {
    const event = await makeFreeEvent();
    await request(app).post(`/v1/events/${event._id}/register`)
      .set('Authorization', `Bearer ${token}`).set('Idempotency-Key', 'cap-1')
      .send({ quantity: 2, attendees: [{ fullName: 'Aditi', phone: '+919876543210' }] });

    const res = await request(app).get(`/v1/events/${event._id}`);
    expect(res.status).toBe(200);
    expect(res.body.data.capacity.registeredCount).toBe(2);
  });

  it('drops back to 0 after the registration is cancelled (slot returns)', async () => {
    const event = await makeFreeEvent();
    const reg = await request(app).post(`/v1/events/${event._id}/register`)
      .set('Authorization', `Bearer ${token}`).set('Idempotency-Key', 'cap-2')
      .send({ quantity: 2, attendees: [{ fullName: 'Aditi', phone: '+919876543210' }] });
    await request(app).post(`/v1/registrations/${reg.body.data._id}/cancel`)
      .set('Authorization', `Bearer ${token}`).send({ reason: 'x' });

    const res = await request(app).get(`/v1/events/${event._id}`);
    expect(res.body.data.capacity.registeredCount).toBe(0);
  });
});

describe('GET /v1/events/:id/roster (organizer attendee list)', () => {
  it('lists non-cancelled attendees with names; excludes cancelled', async () => {
    const event = await makeFreeEvent();
    const reg = await request(app).post(`/v1/events/${event._id}/register`)
      .set('Authorization', `Bearer ${token}`).set('Idempotency-Key', 'ros-1')
      .send({ quantity: 1, attendees: [{ fullName: 'Aditi Rao', phone: '+919876543210' }] });

    let res = await request(app).get(`/v1/events/${event._id}/roster`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(1);
    expect(res.body.data.rows[0].name).toBe('Aditi Rao');

    await request(app).post(`/v1/registrations/${reg.body.data._id}/cancel`)
      .set('Authorization', `Bearer ${token}`).send({ reason: 'x' });
    res = await request(app).get(`/v1/events/${event._id}/roster`).set('Authorization', `Bearer ${token}`);
    expect(res.body.data.total).toBe(0);
  });
});

describe('GET /v1/organizers/me/events (derives organizer from auth)', () => {
  it('returns the caller\'s events without a query param', async () => {
    await Event.create({
      title: 'My Hosted Event', description: 'x', eventType: 'workshop', category: 'dance',
      organizerId: userId, organizerSnapshot: { name: 'Me', organizationName: '' },
      pricingMode: 'fixed', ticketPrice: 0,
      schedule: { startDate: new Date(Date.now() + 7 * 86400000), endDate: new Date(Date.now() + 8 * 86400000), totalDurationMinutes: 120, dayBreakdown: [] },
      location: { type: 'physical', city: 'Pune', state: 'MH', country: 'IN' }, maxParticipants: 10, status: 'live',
    });
    const res = await request(app).get('/v1/organizers/me/events').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].title).toBe('My Hosted Event');
  });
});

describe('response-shape overlays (FE↔BE parity)', () => {
  it('GET event overlays pricing.amount from ticketPrice', async () => {
    const event = await makeFreeEvent();
    const res = await request(app).get(`/v1/events/${event._id}`);
    expect(res.body.data.pricing.amount).toBe(0); // free fixture
    expect(res.body.data.pricing.currency).toBe('INR');
  });

  it('getMyRegistration aliases attendeeCount from quantity', async () => {
    const event = await makeFreeEvent();
    await request(app).post(`/v1/events/${event._id}/register`)
      .set('Authorization', `Bearer ${token}`).set('Idempotency-Key', 'shape-1')
      .send({ quantity: 2, attendees: [{ fullName: 'Aditi', phone: '+919876543210' }] });
    const res = await request(app).get(`/v1/events/${event._id}/registrations/me`).set('Authorization', `Bearer ${token}`);
    expect(res.body.data.attendeeCount).toBe(2);
  });
});

describe('GET /v1/events — viewerContext in list', () => {
  it('flags hasRegistered per event for the signed-in user', async () => {
    const event = await makeFreeEvent();
    await request(app).post(`/v1/events/${event._id}/register`)
      .set('Authorization', `Bearer ${token}`).set('Idempotency-Key', 'vc-1')
      .send({ quantity: 1, attendees: [{ fullName: 'Aditi', phone: '+919876543210' }] });

    const res = await request(app).get('/v1/events').set('Authorization', `Bearer ${token}`);
    const mine = (res.body.data || []).find((e: any) => String(e._id) === String(event._id));
    expect(mine.viewerContext.hasRegistered).toBe(true);
    expect(mine.viewerContext.registrationStatus).toBe('registered');
  });
});

describe('GET /v1/events/:id — organizer enrich', () => {
  it('overlays organizerSnapshot from the organizer profile (name/avatar/verified)', async () => {
    const organizer = await User.create({
      displayName: 'Saswati Sen', email: `org${Date.now()}@x.com`, authProvider: 'phone',
      role: 'organizer', profileImageUrl: 'https://cdn/x.jpg', kycStatus: 'approved',
    } as any);
    const event = await Event.create({
      title: 'Org Enrich', description: 'x', eventType: 'workshop', category: 'dance',
      organizerId: organizer._id, organizerSnapshot: { name: 'stale', organizationName: '' },
      pricingMode: 'fixed', ticketPrice: 0,
      schedule: { startDate: new Date(Date.now() + 7 * 86400000), endDate: new Date(Date.now() + 8 * 86400000), totalDurationMinutes: 120, dayBreakdown: [] },
      location: { type: 'physical', city: 'Pune', state: 'MH', country: 'IN' }, maxParticipants: 10, status: 'live',
    });
    const res = await request(app).get(`/v1/events/${event._id}`);
    expect(res.body.data.organizerSnapshot.name).toBe('Saswati Sen');
    expect(res.body.data.organizerSnapshot.verified).toBe(true);
    expect(res.body.data.organizerSnapshot.avatar).toBe('https://cdn/x.jpg');
  });
});

describe('POST /v1/events/:id/register — capacity enforcement', () => {
  it('409s with waitlistAvailable when the event is full', async () => {
    const event = await Event.create({
      title: 'Tiny', description: 'x', eventType: 'workshop', category: 'dance',
      organizerId: new mongoose.Types.ObjectId(), organizerSnapshot: { name: 'S', organizationName: '' },
      pricingMode: 'fixed', ticketPrice: 0,
      schedule: { startDate: new Date(Date.now() + 7 * 86400000), endDate: new Date(Date.now() + 8 * 86400000), totalDurationMinutes: 120, dayBreakdown: [] },
      location: { type: 'physical', city: 'Pune', state: 'MH', country: 'IN' }, maxParticipants: 1, status: 'live', allowWaitlist: true,
    });
    const a = jwt.sign({ id: new mongoose.Types.ObjectId().toString(), role: 'artist' }, process.env.JWT_SECRET!);
    const b = jwt.sign({ id: new mongoose.Types.ObjectId().toString(), role: 'artist' }, process.env.JWT_SECRET!);
    const r1 = await request(app).post(`/v1/events/${event._id}/register`)
      .set('Authorization', `Bearer ${a}`).set('Idempotency-Key', 'cap-a')
      .send({ quantity: 1, attendees: [{ fullName: 'A', phone: '+910000000000' }] });
    expect(r1.status).toBe(201);

    const r2 = await request(app).post(`/v1/events/${event._id}/register`)
      .set('Authorization', `Bearer ${b}`).set('Idempotency-Key', 'cap-b')
      .send({ quantity: 1, attendees: [{ fullName: 'B', phone: '+910000000001' }] });
    expect(r2.status).toBe(409);
    expect(r2.body.data.waitlistAvailable).toBe(true);
  });
});

describe('GET /v1/events/:id — waitlistCount overlay', () => {
  it('counts waiting entries (for the manage Waitlist tile)', async () => {
    const event = await makeFreeEvent();
    await WaitlistEntry.create({
      eventId: event._id, userId: new mongoose.Types.ObjectId(), position: 1, quantity: 1,
      status: 'waiting', attendeeSnapshot: { fullName: 'W', phone: '+910000000002' },
    });
    const res = await request(app).get(`/v1/events/${event._id}`);
    expect(res.body.data.waitlistCount).toBe(1);
  });
});
