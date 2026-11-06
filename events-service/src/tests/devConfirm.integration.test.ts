import request from 'supertest';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import app from '../server';
import Event from '../models/Event';
import EventReservation from '../models/EventReservation';
import EventRegistration from '../models/EventRegistration';
import EventTicket from '../models/EventTicket';
import UserPayoutAccount from '../models/UserPayoutAccount';

process.env.JWT_SECRET = 'test-secret';

// Reserve must not hit the network. Mirror CASHFREE_DEV_MODE: a `session_dev_` session + a seed
// orderId the dev-confirm endpoint will look the reservation up by (its razorpayOrderId).
jest.mock('../services/payments', () => ({
  ...jest.requireActual('../services/payments'),
  payments: {
    createOrderWithSplit: jest.fn(async (o: any) => ({ orderId: o.orderId, paymentSessionId: 'session_dev_abc123' })),
  },
}));

const userId = new mongoose.Types.ObjectId().toString();
const token = jwt.sign({ id: userId, role: 'artist' }, process.env.JWT_SECRET);
const otherToken = jwt.sign({ id: new mongoose.Types.ObjectId().toString(), role: 'artist' }, process.env.JWT_SECRET);

async function makePaidEvent() {
  const organizerId = new mongoose.Types.ObjectId();
  await UserPayoutAccount.create({
    userId: organizerId, provider: 'cashfree', linkedAccountId: 'vendor_ORG1', status: 'verified',
    businessType: 'individual', panMasked: 'ABCDE****F', accountHolderName: 'Saswati Sen',
    bankLast4: '9012', bankName: 'SBI', ifsc: 'SBIN0007613', submittedAt: new Date(), verifiedAt: new Date(),
  });
  return Event.create({
    title: 'Kathak Foundations', description: 'x', eventType: 'workshop', category: 'dance',
    organizerId, organizerSnapshot: { name: 'Saswati', organizationName: 'Sawai' },
    pricingMode: 'fixed', ticketPrice: 4500,
    schedule: { startDate: new Date(Date.now() + 7 * 86400000), endDate: new Date(Date.now() + 8 * 86400000), totalDurationMinutes: 120, dayBreakdown: [] },
    location: { type: 'physical', city: 'Pune', state: 'MH', country: 'IN' },
    maxParticipants: 24, status: 'live',
  });
}

async function reserve(eventId: any, idemKey: string, quantity = 1) {
  const res = await request(app).post(`/v1/events/${eventId}/reserve`)
    .set('Authorization', `Bearer ${token}`).set('Idempotency-Key', idemKey).send({ quantity });
  return res.body.data.razorpayOrderId as string;
}

describe('POST /v1/reservations/:orderId/dev-confirm', () => {
  afterEach(() => { delete process.env.CASHFREE_DEV_MODE; });

  it('404s (and creates nothing) when CASHFREE_DEV_MODE is not enabled', async () => {
    delete process.env.CASHFREE_DEV_MODE;
    const event = await makePaidEvent();
    const orderId = await reserve(event._id, 'dc-off');

    const res = await request(app).post(`/v1/reservations/${orderId}/dev-confirm`)
      .set('Authorization', `Bearer ${token}`).send({});

    expect(res.status).toBe(404);
    expect(await EventRegistration.countDocuments({ eventId: event._id })).toBe(0);
    expect((await EventReservation.findOne({ razorpayOrderId: orderId }))?.status).toBe('reserved');
  });

  it('confirms the hold → registered registration + one ticket per seat + dev paymentRecord', async () => {
    process.env.CASHFREE_DEV_MODE = '1';
    const event = await makePaidEvent();
    const orderId = await reserve(event._id, 'dc-ok', 2);

    const res = await request(app).post(`/v1/reservations/${orderId}/dev-confirm`)
      .set('Authorization', `Bearer ${token}`).send({});

    expect(res.status).toBe(200);
    expect(res.body.data.paymentStatus).toBe('completed');

    const reg = await EventRegistration.findOne({ eventId: event._id });
    expect(reg?.status).toBe('registered');
    expect(reg?.quantity).toBe(2);
    expect(reg?.paymentRecord?.razorpayPaymentId).toMatch(/^dev_pay_/);

    expect(await EventTicket.countDocuments({ registrationId: reg!._id })).toBe(2);
    expect((await EventReservation.findOne({ razorpayOrderId: orderId }))?.status).toBe('paid');
  });

  it('is idempotent — a second dev-confirm does not double-create', async () => {
    process.env.CASHFREE_DEV_MODE = '1';
    const event = await makePaidEvent();
    const orderId = await reserve(event._id, 'dc-idem');

    await request(app).post(`/v1/reservations/${orderId}/dev-confirm`).set('Authorization', `Bearer ${token}`).send({});
    await request(app).post(`/v1/reservations/${orderId}/dev-confirm`).set('Authorization', `Bearer ${token}`).send({});

    expect(await EventRegistration.countDocuments({ eventId: event._id })).toBe(1);
  });

  it("404s when the hold belongs to a different user (can't confirm someone else's)", async () => {
    process.env.CASHFREE_DEV_MODE = '1';
    const event = await makePaidEvent();
    const orderId = await reserve(event._id, 'dc-owner');

    const res = await request(app).post(`/v1/reservations/${orderId}/dev-confirm`)
      .set('Authorization', `Bearer ${otherToken}`).send({});

    expect(res.status).toBe(404);
    expect(await EventRegistration.countDocuments({ eventId: event._id })).toBe(0);
  });

  it('names the registration + ticket from reserve attendees (not "Guest")', async () => {
    process.env.CASHFREE_DEV_MODE = '1';
    const event = await makePaidEvent();
    const r = await request(app).post(`/v1/events/${event._id}/reserve`)
      .set('Authorization', `Bearer ${token}`).set('Idempotency-Key', 'dc-name')
      .send({ quantity: 2, attendees: [{ fullName: 'Asha Rao', phone: '9876543210' }, { fullName: 'Dev Rao', phone: '9876543210' }] });
    const orderId = r.body.data.razorpayOrderId;

    await request(app).post(`/v1/reservations/${orderId}/dev-confirm`).set('Authorization', `Bearer ${token}`).send({});

    const reg = await EventRegistration.findOne({ eventId: event._id });
    expect(reg?.attendees?.map((a: any) => a.fullName)).toEqual(['Asha Rao', 'Dev Rao']);
    const names = (await EventTicket.find({ registrationId: reg!._id }).sort({ ticketId: 1 })).map((t) => t.attendeeName);
    expect(names).toEqual(['Asha Rao', 'Dev Rao']);
    expect(names).not.toContain('Guest');
  });
});
