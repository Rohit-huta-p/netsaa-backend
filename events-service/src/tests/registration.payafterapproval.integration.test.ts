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
process.env.RAZORPAY_WEBHOOK_SECRET = 'whsec_test';

let orderSeq = 0;
jest.mock('../services/razorpay', () => ({
  ...jest.requireActual('../services/razorpay'),
  createOrderWithTransfer: jest.fn().mockImplementation(() => Promise.resolve({ orderId: `order_e2e_${Date.now()}_${++orderSeq}` })),
}));

const organizerId = new mongoose.Types.ObjectId();
const hostToken = jwt.sign({ id: organizerId.toString(), role: 'artist' }, process.env.JWT_SECRET);
const tok = (id = new mongoose.Types.ObjectId().toString()) => jwt.sign({ id, role: 'artist' }, process.env.JWT_SECRET!);

async function addPayout() {
  await UserPayoutAccount.create({
    userId: organizerId, provider: 'razorpay', linkedAccountId: 'acc_PAA', status: 'verified',
    businessType: 'individual', panMasked: 'ABCDE****F', accountHolderName: 'S',
    bankLast4: '9012', bankName: 'SBI', ifsc: 'SBIN0007613', submittedAt: new Date(), verifiedAt: new Date(),
  });
}

async function makePaidGuestListEvent(maxParticipants = 20, withPayout = true) {
  if (withPayout) await addPayout();
  return Event.create({
    title: 'Paid Audition', description: 'x', eventType: 'audition', category: 'dance',
    organizerId, organizerSnapshot: { name: 'S', organizationName: '' },
    pricingMode: 'fixed', ticketPrice: 4500,
    schedule: { startDate: new Date(Date.now() + 7 * 86400000), endDate: new Date(Date.now() + 8 * 86400000), totalDurationMinutes: 120, dayBreakdown: [] },
    location: { type: 'physical', city: 'Pune', state: 'MH', country: 'IN' },
    maxParticipants, status: 'live',
    registration: { door: 'guest_list', questions: [] },
  });
}

const reqJoin = (eventId: any, token: string, key: string) =>
  request(app).post(`/v1/events/${eventId}/register`).set('Authorization', `Bearer ${token}`).set('Idempotency-Key', key)
    .send({ quantity: 1, attendees: [{ fullName: 'Guest', phone: '+919876543210' }] });

const approve = (regId: any) =>
  request(app).post(`/v1/registrations/${regId}/approve`).set('Authorization', `Bearer ${hostToken}`).send({});

function signed(body: object) {
  const raw = JSON.stringify(body);
  const sig = crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET!).update(raw).digest('hex');
  return { raw, sig };
}

describe('Pay-after-approval (gap e)', () => {
  it('approving a PAID request → approved (not registered), no ticket, returns a 48h pay hold', async () => {
    const event = await makePaidGuestListEvent();
    const attendee = tok();
    const reg = await reqJoin(event._id, attendee, 'paa-1');
    expect(reg.body.data.status).toBe('pending');

    const res = await approve(reg.body.data._id);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('approved');
    expect(res.body.data.payment.razorpayOrderId).toMatch(/^order_e2e_/);
    expect(res.body.data.payment.amountPaise).toBeGreaterThan(0);
    expect(new Date(res.body.data.payment.payBy).getTime()).toBeGreaterThan(Date.now() + 47 * 3600 * 1000);

    // no ticket yet; a linked reservation holds the seat
    expect(await EventTicket.countDocuments({ registrationId: reg.body.data._id })).toBe(0);
    const resv = await EventReservation.findOne({ registrationId: reg.body.data._id }).lean();
    expect(resv?.status).toBe('reserved');
    expect(String(resv?.registrationId)).toBe(String(reg.body.data._id));
  });

  it('the attendee polls getMyRegistration for the pay link while approved', async () => {
    const event = await makePaidGuestListEvent();
    const attendee = tok();
    const reg = await reqJoin(event._id, attendee, 'paa-poll');
    await approve(reg.body.data._id);

    const me = await request(app).get(`/v1/events/${event._id}/registrations/me`).set('Authorization', `Bearer ${attendee}`);
    expect(me.status).toBe(200);
    expect(me.body.data.status).toBe('approved');
    expect(me.body.data.pendingPayment.razorpayOrderId).toMatch(/^order_e2e_/);
  });

  it('webhook capture confirms the SAME approved registration (→ registered + ticket), no duplicate', async () => {
    const event = await makePaidGuestListEvent();
    const attendee = tok();
    const reg = await reqJoin(event._id, attendee, 'paa-wh');
    const ap = await approve(reg.body.data._id);
    const orderId = ap.body.data.payment.razorpayOrderId;

    const { raw, sig } = signed({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_paa', order_id: orderId, amount: ap.body.data.payment.amountPaise } } } });
    const wh = await request(app).post('/v1/razorpay/webhook').set('x-razorpay-signature', sig).set('Content-Type', 'application/json').send(raw);
    expect(wh.status).toBe(200);

    const reg2 = await EventRegistration.findById(reg.body.data._id).lean();
    expect(reg2?.status).toBe('registered');
    expect(reg2?.paymentRecord?.razorpayPaymentId).toBe('pay_paa');
    expect(await EventTicket.countDocuments({ registrationId: reg.body.data._id })).toBe(1);
    // exactly one registration for the event — no duplicate created by the webhook
    expect(await EventRegistration.countDocuments({ eventId: event._id })).toBe(1);
  });

  it('an approved (unpaid) request holds its seat against capacity', async () => {
    const event = await makePaidGuestListEvent(1);
    const a = await reqJoin(event._id, tok(), 'paa-cap-a');
    const b = await reqJoin(event._id, tok(), 'paa-cap-b');
    const okA = await approve(a.body.data._id);
    expect(okA.body.data.status).toBe('approved'); // holds the one seat
    const fullB = await approve(b.body.data._id);
    expect(fullB.status).toBe(409);
    expect(fullB.body.meta.message).toMatch(/full/i);
  });

  it('409s the approval when the organizer has no verified payout account', async () => {
    const event = await makePaidGuestListEvent(20, false); // no payout
    const reg = await reqJoin(event._id, tok(), 'paa-nopayout');
    const res = await approve(reg.body.data._id);
    expect(res.status).toBe(409);
    expect(res.body.meta.message).toMatch(/payout/i);
    // unchanged: still pending, not approved
    const reg2 = await EventRegistration.findById(reg.body.data._id).lean();
    expect(reg2?.status).toBe('pending');
  });

  it('a FREE approval still confirms immediately (no pay hold)', async () => {
    const event = await Event.create({
      title: 'Free Guest List', description: 'x', eventType: 'workshop', category: 'dance',
      organizerId, organizerSnapshot: { name: 'S', organizationName: '' },
      pricingMode: 'fixed', ticketPrice: 0,
      schedule: { startDate: new Date(Date.now() + 7 * 86400000), endDate: new Date(Date.now() + 8 * 86400000), totalDurationMinutes: 120, dayBreakdown: [] },
      location: { type: 'physical', city: 'Pune', state: 'MH', country: 'IN' },
      maxParticipants: 20, status: 'live',
      registration: { door: 'guest_list', questions: [] },
    });
    const reg = await reqJoin(event._id, tok(), 'paa-free');
    const res = await approve(reg.body.data._id);
    expect(res.body.data.status).toBe('registered');
    expect(res.body.data.payment).toBeUndefined();
    expect(await EventTicket.countDocuments({ registrationId: reg.body.data._id })).toBe(1);
  });
});
