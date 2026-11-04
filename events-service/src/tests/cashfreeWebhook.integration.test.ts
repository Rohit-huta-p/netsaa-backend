import request from 'supertest';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import crypto from 'crypto';
import app from '../server';
import Event from '../models/Event';
import EventRegistration from '../models/EventRegistration';
import EventReservation from '../models/EventReservation';
import EventTicket from '../models/EventTicket';
import UserPayoutAccount from '../models/UserPayoutAccount';

process.env.JWT_SECRET = 'test-secret';
process.env.CASHFREE_SECRET_KEY = 'cf_test_secret'; // used to sign/verify the webhook

// Reserve/approve order creation is mocked; the webhook verify + capture is REAL (cashfreeProvider).
jest.mock('../services/payments', () => ({
  ...jest.requireActual('../services/payments'),
  payments: { createOrderWithSplit: jest.fn().mockResolvedValue({ orderId: 'order_cf_wh_1', paymentSessionId: 'sess_cf_1' }) },
}));

const organizerId = new mongoose.Types.ObjectId();
const hostToken = jwt.sign({ id: organizerId.toString(), role: 'artist' }, process.env.JWT_SECRET);
const tok = (id = new mongoose.Types.ObjectId().toString()) => jwt.sign({ id, role: 'artist' }, process.env.JWT_SECRET!);

async function paidGuestListEvent() {
  await UserPayoutAccount.create({
    userId: organizerId, provider: 'cashfree', linkedAccountId: String(organizerId), status: 'verified',
    businessType: 'individual', panMasked: 'ABCDE****F', accountHolderName: 'S',
    bankLast4: '9012', bankName: 'SBI', ifsc: 'SBIN0007613', submittedAt: new Date(), verifiedAt: new Date(),
  });
  return Event.create({
    title: 'Paid Audition', description: 'x', eventType: 'audition', category: 'dance',
    organizerId, organizerSnapshot: { name: 'S', organizationName: '' },
    pricingMode: 'fixed', ticketPrice: 4500,
    schedule: { startDate: new Date(Date.now() + 7 * 86400000), endDate: new Date(Date.now() + 8 * 86400000), totalDurationMinutes: 120, dayBreakdown: [] },
    location: { type: 'physical', city: 'Pune', state: 'MH', country: 'IN' },
    maxParticipants: 20, status: 'live',
    registration: { door: 'guest_list', questions: [] },
  });
}

const reqJoin = (eventId: any, token: string, key: string) =>
  request(app).post(`/v1/events/${eventId}/register`).set('Authorization', `Bearer ${token}`).set('Idempotency-Key', key)
    .send({ quantity: 1, attendees: [{ fullName: 'Guest', phone: '+919876543210' }] });

function cfSigned(body: object) {
  const raw = JSON.stringify(body);
  const ts = String(Date.now());
  const sig = crypto.createHmac('sha256', process.env.CASHFREE_SECRET_KEY!).update(ts + raw).digest('base64');
  return { raw, ts, sig };
}

const postWebhook = (raw: string, ts: string, sig: string) =>
  request(app).post('/v1/cashfree/webhook')
    .set('x-webhook-signature', sig).set('x-webhook-timestamp', ts)
    .set('Content-Type', 'application/json').send(raw);

describe('Cashfree webhook', () => {
  it('PAYMENT_SUCCESS confirms an approved registration → registered + ticket', async () => {
    const event = await paidGuestListEvent();
    const attendee = tok();
    const reg = await reqJoin(event._id, attendee, 'cfwh-1');
    const ap = await request(app).post(`/v1/registrations/${reg.body.data._id}/approve`).set('Authorization', `Bearer ${hostToken}`).send({});
    const orderId = ap.body.data.payment.orderId;
    expect(orderId).toBe('order_cf_wh_1');

    const { raw, ts, sig } = cfSigned({
      type: 'PAYMENT_SUCCESS_WEBHOOK',
      data: { order: { order_id: orderId }, payment: { cf_payment_id: 'cfpay_1', payment_status: 'SUCCESS' } },
    });
    const wh = await postWebhook(raw, ts, sig);
    expect(wh.status).toBe(200);

    const reg2 = await EventRegistration.findById(reg.body.data._id).lean();
    expect(reg2?.status).toBe('registered');
    expect(reg2?.paymentRecord?.razorpayPaymentId).toBe('cfpay_1');
    expect(await EventTicket.countDocuments({ registrationId: reg.body.data._id })).toBe(1);
    const resv = await EventReservation.findOne({ razorpayOrderId: orderId }).lean();
    expect(resv?.status).toBe('paid');
  });

  it('rejects an invalid signature with 401', async () => {
    const { raw, ts } = cfSigned({ type: 'PAYMENT_SUCCESS_WEBHOOK', data: {} });
    const wh = await postWebhook(raw, ts, 'bogus-signature');
    expect(wh.status).toBe(401);
  });

  it('ignores a PAYMENT_SUCCESS for an unknown order (200, no-op)', async () => {
    const { raw, ts, sig } = cfSigned({
      type: 'PAYMENT_SUCCESS_WEBHOOK',
      data: { order: { order_id: 'order_does_not_exist' }, payment: { cf_payment_id: 'x' } },
    });
    const wh = await postWebhook(raw, ts, sig);
    expect(wh.status).toBe(200);
    expect(wh.body.meta.message).toMatch(/no reservation/i);
  });
});
