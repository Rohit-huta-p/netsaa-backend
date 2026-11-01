import request from 'supertest';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import crypto from 'crypto';
import app from '../server';
import Event from '../models/Event';
import EventRegistration from '../models/EventRegistration';
import EventReservation from '../models/EventReservation';
import UserPayoutAccount from '../models/UserPayoutAccount';
import { computeFeesPaise } from '../utils/eventFees';

process.env.JWT_SECRET = 'test-secret';
process.env.RAZORPAY_WEBHOOK_SECRET = 'whsec_test';

jest.mock('../services/razorpay', () => ({
  ...jest.requireActual('../services/razorpay'),
  createOrderWithTransfer: jest.fn().mockResolvedValue({ orderId: 'order_SPOT1' }),
}));

const token = (id = new mongoose.Types.ObjectId().toString()) => jwt.sign({ id, role: 'artist' }, process.env.JWT_SECRET!);
const userToken = token();
const organizerId = new mongoose.Types.ObjectId();

async function makeFreeMultiSpot(spots: any[]) {
  return Event.create({
    title: 'Free Tiers', description: 'x', eventType: 'workshop', category: 'dance',
    organizerId, organizerSnapshot: { name: 'S', organizationName: '' },
    pricingMode: 'fixed', ticketPrice: 0,
    schedule: { startDate: new Date(Date.now() + 7 * 86400000), endDate: new Date(Date.now() + 8 * 86400000), totalDurationMinutes: 120, dayBreakdown: [] },
    location: { type: 'physical', city: 'Pune', state: 'MH', country: 'IN' },
    maxParticipants: spots.reduce((n, s) => n + s.capacity, 0), status: 'live', allowWaitlist: true,
    spots,
  });
}

async function makePaidMultiSpot() {
  await UserPayoutAccount.create({
    userId: organizerId, provider: 'razorpay', linkedAccountId: 'acc_SPOT', status: 'verified',
    businessType: 'individual', panMasked: 'ABCDE****F', accountHolderName: 'S',
    bankLast4: '9012', bankName: 'SBI', ifsc: 'SBIN0007613', submittedAt: new Date(), verifiedAt: new Date(),
  });
  return Event.create({
    title: 'Paid Tiers', description: 'x', eventType: 'performance', category: 'dance',
    organizerId, organizerSnapshot: { name: 'S', organizationName: '' },
    pricingMode: 'fixed', ticketPrice: 3000, // lowest paid spot
    schedule: { startDate: new Date(Date.now() + 7 * 86400000), endDate: new Date(Date.now() + 8 * 86400000), totalDurationMinutes: 120, dayBreakdown: [] },
    location: { type: 'physical', city: 'Pune', state: 'MH', country: 'IN' },
    maxParticipants: 15, status: 'live',
    spots: [{ name: 'Standard', capacity: 10, price: 3000 }, { name: 'Front Row', capacity: 5, price: 5000 }],
  });
}

const spotId = (event: any, name: string) => String(event.spots.find((s: any) => s.name === name)._id);

function signed(body: object) {
  const raw = JSON.stringify(body);
  const sig = crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET!).update(raw).digest('hex');
  return { raw, sig };
}

describe('Spot selection — free register', () => {
  it('stores the chosen spotId', async () => {
    const event = await makeFreeMultiSpot([{ name: 'General', capacity: 2, price: 0 }, { name: 'Student', capacity: 1, price: 0 }]);
    const res = await request(app).post(`/v1/events/${event._id}/register`)
      .set('Authorization', `Bearer ${userToken}`).set('Idempotency-Key', 'spot-free-1')
      .send({ quantity: 1, attendees: [{ fullName: 'Aditi', phone: '+919876543210' }], spotId: spotId(event, 'Student') });
    expect(res.status).toBe(201);
    const reg = await EventRegistration.findById(res.body.data._id).lean();
    expect(String(reg?.spotId)).toBe(spotId(event, 'Student'));
  });

  it('400s when a multi-spot event gets no spotId', async () => {
    const event = await makeFreeMultiSpot([{ name: 'General', capacity: 2, price: 0 }, { name: 'Student', capacity: 1, price: 0 }]);
    const res = await request(app).post(`/v1/events/${event._id}/register`)
      .set('Authorization', `Bearer ${userToken}`).set('Idempotency-Key', 'spot-free-noid')
      .send({ quantity: 1, attendees: [{ fullName: 'Aditi', phone: '+919876543210' }] });
    expect(res.status).toBe(400);
    expect(res.body.errors[0].message).toMatch(/spotId is required/);
  });

  it('409s on a paid spot via the free path (routes to reserve)', async () => {
    const event = await makeFreeMultiSpot([{ name: 'General', capacity: 5, price: 0 }, { name: 'VIP', capacity: 5, price: 1000 }]);
    const res = await request(app).post(`/v1/events/${event._id}/register`)
      .set('Authorization', `Bearer ${userToken}`).set('Idempotency-Key', 'spot-free-paid')
      .send({ quantity: 1, attendees: [{ fullName: 'Aditi', phone: '+919876543210' }], spotId: spotId(event, 'VIP') });
    expect(res.status).toBe(409);
    expect(res.body.data.paid).toBe(true);
  });

  it('enforces per-spot capacity: one tier fills while another stays open', async () => {
    const event = await makeFreeMultiSpot([{ name: 'General', capacity: 2, price: 0 }, { name: 'Student', capacity: 1, price: 0 }]);
    const a = userToken; const b = token();

    const r1 = await request(app).post(`/v1/events/${event._id}/register`)
      .set('Authorization', `Bearer ${a}`).set('Idempotency-Key', 'cap-student-a')
      .send({ quantity: 1, attendees: [{ fullName: 'A', phone: '+910000000000' }], spotId: spotId(event, 'Student') });
    expect(r1.status).toBe(201);

    const r2 = await request(app).post(`/v1/events/${event._id}/register`)
      .set('Authorization', `Bearer ${b}`).set('Idempotency-Key', 'cap-student-b')
      .send({ quantity: 1, attendees: [{ fullName: 'B', phone: '+910000000001' }], spotId: spotId(event, 'Student') });
    expect(r2.status).toBe(409);
    expect(String(r2.body.data.spotId)).toBe(spotId(event, 'Student'));

    const r3 = await request(app).post(`/v1/events/${event._id}/register`)
      .set('Authorization', `Bearer ${b}`).set('Idempotency-Key', 'cap-general-b')
      .send({ quantity: 1, attendees: [{ fullName: 'B', phone: '+910000000001' }], spotId: spotId(event, 'General') });
    expect(r3.status).toBe(201);
  });

  it('back-compat: a single-spot event registers with no spotId (defaults to the sole spot)', async () => {
    const event = await makeFreeMultiSpot([{ name: 'General', capacity: 10, price: 0 }]);
    const res = await request(app).post(`/v1/events/${event._id}/register`)
      .set('Authorization', `Bearer ${userToken}`).set('Idempotency-Key', 'spot-single')
      .send({ quantity: 1, attendees: [{ fullName: 'Aditi', phone: '+919876543210' }] });
    expect(res.status).toBe(201);
    const reg = await EventRegistration.findById(res.body.data._id).lean();
    expect(String(reg?.spotId)).toBe(spotId(event, 'General'));
  });
});

describe('Spot selection — paid reserve → webhook', () => {
  it('prices off the chosen tier, not the lowest, and carries spotId to the registration', async () => {
    const event = await makePaidMultiSpot();
    const res = await request(app).post(`/v1/events/${event._id}/reserve`)
      .set('Authorization', `Bearer ${userToken}`).set('Idempotency-Key', 'spot-paid-fr')
      .send({ quantity: 1, spotId: spotId(event, 'Front Row') });

    expect(res.status).toBe(201);
    const expected = computeFeesPaise(5000 * 100, 1).customerPaysPaise;
    expect(res.body.data.amountPaise).toBe(expected);
    expect(res.body.data.amountPaise).not.toBe(computeFeesPaise(3000 * 100, 1).customerPaysPaise);

    const resv = await EventReservation.findOne({ idempotencyKey: 'spot-paid-fr' }).lean();
    expect(String(resv?.spotId)).toBe(spotId(event, 'Front Row'));

    const { raw, sig } = signed({
      event: 'payment.captured',
      payload: { payment: { entity: { id: 'pay_spot', order_id: res.body.data.razorpayOrderId, amount: expected } } },
    });
    await request(app).post('/v1/razorpay/webhook').set('x-razorpay-signature', sig).set('Content-Type', 'application/json').send(raw);

    const reg = await EventRegistration.findOne({ eventId: event._id }).lean();
    expect(String(reg?.spotId)).toBe(spotId(event, 'Front Row'));
    expect(reg?.paymentRecord?.amountPaise).toBe(expected);
  });

  it('400s a reserve that omits spotId for a multi-spot event', async () => {
    const event = await makePaidMultiSpot();
    const res = await request(app).post(`/v1/events/${event._id}/reserve`)
      .set('Authorization', `Bearer ${userToken}`).set('Idempotency-Key', 'spot-paid-noid')
      .send({ quantity: 1 });
    expect(res.status).toBe(400);
    expect(await EventReservation.countDocuments({ eventId: event._id })).toBe(0);
  });
});
