import request from 'supertest';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import crypto from 'crypto';
import app from '../server';
import Event from '../models/Event';
import EventReservation from '../models/EventReservation';
import EventRegistration from '../models/EventRegistration';
import UserPayoutAccount from '../models/UserPayoutAccount';

process.env.JWT_SECRET = 'test-secret';
process.env.RAZORPAY_WEBHOOK_SECRET = 'whsec_test';

jest.mock('../services/razorpay', () => ({
  ...jest.requireActual('../services/razorpay'),
  createOrderWithTransfer: jest.fn().mockResolvedValue({ orderId: 'order_TEST1' }),
}));

const userId = new mongoose.Types.ObjectId().toString();
const token = jwt.sign({ id: userId, role: 'artist' }, process.env.JWT_SECRET);

async function makePaidEvent() {
  const organizerId = new mongoose.Types.ObjectId();
  await UserPayoutAccount.create({
    userId: organizerId,
    provider: 'razorpay',
    linkedAccountId: 'acc_ORG1',
    status: 'verified',
    businessType: 'individual',
    panMasked: 'ABCDE****F',
    accountHolderName: 'Saswati Sen',
    bankLast4: '9012',
    bankName: 'SBI',
    ifsc: 'SBIN0007613',
    submittedAt: new Date(),
    verifiedAt: new Date(),
  });
  return Event.create({
    title: 'Kathak Foundations', description: 'x', eventType: 'workshop', category: 'dance',
    organizerId,
    organizerSnapshot: { name: 'Saswati', organizationName: 'Sawai' },
    pricingMode: 'fixed', ticketPrice: 4500,
    schedule: { startDate: new Date(Date.now() + 7 * 86400000), endDate: new Date(Date.now() + 8 * 86400000), totalDurationMinutes: 120, dayBreakdown: [] },
    location: { type: 'physical', city: 'Pune', state: 'MH', country: 'IN' },
    maxParticipants: 24, status: 'live',
  });
}

describe('POST /v1/events/:id/reserve', () => {
  it('creates a reservation with razorpayOrderId + correct amount', async () => {
    const event = await makePaidEvent();
    const res = await request(app).post(`/v1/events/${event._id}/reserve`)
      .set('Authorization', `Bearer ${token}`).set('Idempotency-Key', 'res-1')
      .send({ quantity: 3 });

    expect(res.status).toBe(201);
    expect(res.body.data.razorpayOrderId).toBe('order_TEST1');
    expect(res.body.data.amountPaise).toBe(1381860); // ₹13,818.60 incl service fee

    const doc = await EventReservation.findOne({ idempotencyKey: 'res-1' });
    expect(doc?.razorpayOrderId).toBe('order_TEST1');
    expect(doc?.status).toBe('reserved');
  });

  it('replays the same reservation for a repeated Idempotency-Key', async () => {
    const event = await makePaidEvent();
    const a = await request(app).post(`/v1/events/${event._id}/reserve`).set('Authorization', `Bearer ${token}`).set('Idempotency-Key', 'res-2').send({ quantity: 1 });
    const b = await request(app).post(`/v1/events/${event._id}/reserve`).set('Authorization', `Bearer ${token}`).set('Idempotency-Key', 'res-2').send({ quantity: 1 });
    expect(b.body.data.reservationId).toBe(a.body.data.reservationId);
    expect(await EventReservation.countDocuments({ eventId: event._id })).toBe(1);
  });
});

function signed(body: object) {
  const raw = JSON.stringify(body);
  const sig = crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET!).update(raw).digest('hex');
  return { raw, sig };
}

describe('POST /v1/razorpay/webhook', () => {
  it('payment.captured confirms the registration and writes paymentRecord', async () => {
    const event = await makePaidEvent();
    const reserveRes = await request(app).post(`/v1/events/${event._id}/reserve`)
      .set('Authorization', `Bearer ${token}`).set('Idempotency-Key', 'res-wh').send({ quantity: 1 });
    const orderId = reserveRes.body.data.razorpayOrderId;

    const { raw, sig } = signed({
      event: 'payment.captured',
      payload: { payment: { entity: { id: 'pay_1', order_id: orderId, amount: 460620 } } },
    });

    const res = await request(app).post('/v1/razorpay/webhook')
      .set('x-razorpay-signature', sig).set('Content-Type', 'application/json').send(raw);

    expect(res.status).toBe(200);
    const reg = await EventRegistration.findOne({ eventId: event._id });
    expect(reg?.status).toBe('registered');
    expect(reg?.paymentRecord?.razorpayPaymentId).toBe('pay_1');
  });

  it('rejects an invalid signature', async () => {
    const res = await request(app).post('/v1/razorpay/webhook')
      .set('x-razorpay-signature', 'bad').set('Content-Type', 'application/json').send(JSON.stringify({ event: 'payment.captured' }));
    expect(res.status).toBe(401);
  });

  it('is idempotent — duplicate capture does not double-create', async () => {
    const event = await makePaidEvent();
    const reserveRes = await request(app).post(`/v1/events/${event._id}/reserve`)
      .set('Authorization', `Bearer ${token}`).set('Idempotency-Key', 'res-wh2').send({ quantity: 1 });
    const orderId = reserveRes.body.data.razorpayOrderId;
    const { raw, sig } = signed({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_2', order_id: orderId, amount: 460620 } } } });

    await request(app).post('/v1/razorpay/webhook').set('x-razorpay-signature', sig).set('Content-Type', 'application/json').send(raw);
    await request(app).post('/v1/razorpay/webhook').set('x-razorpay-signature', sig).set('Content-Type', 'application/json').send(raw);

    expect(await EventRegistration.countDocuments({ eventId: event._id })).toBe(1);
  });

  // DECISION ① · payment.failed must NOT release the hold (retry uses the same order)
  it('payment.failed keeps the reservation held for retry', async () => {
    const event = await makePaidEvent();
    const reserveRes = await request(app).post(`/v1/events/${event._id}/reserve`)
      .set('Authorization', `Bearer ${token}`).set('Idempotency-Key', 'res-fail').send({ quantity: 1 });
    const orderId = reserveRes.body.data.razorpayOrderId;
    const { raw, sig } = signed({ event: 'payment.failed', payload: { payment: { entity: { id: 'pay_f', order_id: orderId } } } });

    const res = await request(app).post('/v1/razorpay/webhook')
      .set('x-razorpay-signature', sig).set('Content-Type', 'application/json').send(raw);

    expect(res.status).toBe(200);
    const resv = await EventReservation.findOne({ razorpayOrderId: orderId });
    expect(resv?.status).toBe('reserved'); // still held — NOT released
  });
});
