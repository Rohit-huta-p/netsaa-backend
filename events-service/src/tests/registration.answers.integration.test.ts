import request from 'supertest';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import crypto from 'crypto';
import app from '../server';
import Event from '../models/Event';
import EventRegistration from '../models/EventRegistration';
import EventReservation from '../models/EventReservation';
import UserPayoutAccount from '../models/UserPayoutAccount';

process.env.JWT_SECRET = 'test-secret';
process.env.RAZORPAY_WEBHOOK_SECRET = 'whsec_test';

jest.mock('../services/razorpay', () => ({
  ...jest.requireActual('../services/razorpay'),
  createOrderWithTransfer: jest.fn().mockResolvedValue({ orderId: 'order_ANS1' }),
}));

const userId = new mongoose.Types.ObjectId().toString();
const token = jwt.sign({ id: userId, role: 'artist' }, process.env.JWT_SECRET);
const organizerId = new mongoose.Types.ObjectId();
const organizerToken = jwt.sign({ id: organizerId.toString(), role: 'artist' }, process.env.JWT_SECRET);

const BASE_QUESTIONS = [
  { label: 'Years of training?', type: 'text', required: true },
  { label: 'Primary style', type: 'choice', options: ['Kathak', 'Bharatanatyam', 'Odissi'], required: false },
];

async function makeQuestionedFreeEvent(questions: any[] = BASE_QUESTIONS) {
  return Event.create({
    title: 'Kathak Intensive', description: 'x', eventType: 'workshop', category: 'dance',
    organizerId,
    organizerSnapshot: { name: 'Saswati', organizationName: '' },
    pricingMode: 'fixed', ticketPrice: 0,
    schedule: { startDate: new Date(Date.now() + 7 * 86400000), endDate: new Date(Date.now() + 8 * 86400000), totalDurationMinutes: 120, dayBreakdown: [] },
    location: { type: 'physical', city: 'Pune', state: 'MH', country: 'IN' },
    maxParticipants: 24, status: 'live',
    registration: { door: 'open', questions },
  });
}

async function makeQuestionedPaidEvent(questions: any[] = BASE_QUESTIONS) {
  await UserPayoutAccount.create({
    userId: organizerId, provider: 'razorpay', linkedAccountId: 'acc_ANS', status: 'verified',
    businessType: 'individual', panMasked: 'ABCDE****F', accountHolderName: 'Saswati Sen',
    bankLast4: '9012', bankName: 'SBI', ifsc: 'SBIN0007613', submittedAt: new Date(), verifiedAt: new Date(),
  });
  return Event.create({
    title: 'Paid Intensive', description: 'x', eventType: 'workshop', category: 'dance',
    organizerId,
    organizerSnapshot: { name: 'Saswati', organizationName: '' },
    pricingMode: 'fixed', ticketPrice: 4500,
    schedule: { startDate: new Date(Date.now() + 7 * 86400000), endDate: new Date(Date.now() + 8 * 86400000), totalDurationMinutes: 120, dayBreakdown: [] },
    location: { type: 'physical', city: 'Pune', state: 'MH', country: 'IN' },
    maxParticipants: 24, status: 'live',
    registration: { door: 'open', questions },
  });
}

const qid = (event: any, label: string) =>
  String(event.registration.questions.find((q: any) => q.label === label)._id);

function signed(body: object) {
  const raw = JSON.stringify(body);
  const sig = crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET!).update(raw).digest('hex');
  return { raw, sig };
}

describe('Custom-question answers — free register', () => {
  it('stores validated answers on the registration', async () => {
    const event = await makeQuestionedFreeEvent();
    const res = await request(app)
      .post(`/v1/events/${event._id}/register`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', 'ans-free-1')
      .send({
        quantity: 1,
        attendees: [{ fullName: 'Aditi', phone: '+919876543210' }],
        answers: [
          { questionId: qid(event, 'Years of training?'), value: '5 years' },
          { questionId: qid(event, 'Primary style'), value: 'Kathak' },
        ],
      });

    expect(res.status).toBe(201);
    const reg = await EventRegistration.findById(res.body.data._id).lean();
    expect(reg?.answers).toHaveLength(2);
    expect(reg?.answers?.find((a: any) => a.label === 'Years of training?')?.value).toBe('5 years');
    expect(reg?.answers?.find((a: any) => a.label === 'Primary style')?.type).toBe('choice');
  });

  it('surfaces answers to the host in the roster', async () => {
    const event = await makeQuestionedFreeEvent();
    await request(app).post(`/v1/events/${event._id}/register`)
      .set('Authorization', `Bearer ${token}`).set('Idempotency-Key', 'ans-ros-1')
      .send({
        quantity: 1,
        attendees: [{ fullName: 'Aditi Rao', phone: '+919876543210' }],
        answers: [{ questionId: qid(event, 'Years of training?'), value: '3 years' }],
      });

    const res = await request(app).get(`/v1/events/${event._id}/roster`).set('Authorization', `Bearer ${organizerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.confirmed[0].answers).toEqual([
      expect.objectContaining({ label: 'Years of training?', value: '3 years' }),
    ]);
  });

  it('400s when a required answer is missing', async () => {
    const event = await makeQuestionedFreeEvent();
    const res = await request(app).post(`/v1/events/${event._id}/register`)
      .set('Authorization', `Bearer ${token}`).set('Idempotency-Key', 'ans-req-1')
      .send({
        quantity: 1,
        attendees: [{ fullName: 'Aditi', phone: '+919876543210' }],
        answers: [{ questionId: qid(event, 'Primary style'), value: 'Kathak' }],
      });
    expect(res.status).toBe(400);
    expect(res.body.errors[0].message).toMatch(/Years of training\?/);
    expect(await EventRegistration.countDocuments({ eventId: event._id })).toBe(0);
  });

  it('400s on a choice value outside the options', async () => {
    const event = await makeQuestionedFreeEvent();
    const res = await request(app).post(`/v1/events/${event._id}/register`)
      .set('Authorization', `Bearer ${token}`).set('Idempotency-Key', 'ans-opt-1')
      .send({
        quantity: 1,
        attendees: [{ fullName: 'Aditi', phone: '+919876543210' }],
        answers: [
          { questionId: qid(event, 'Years of training?'), value: '2 years' },
          { questionId: qid(event, 'Primary style'), value: 'Flamenco' },
        ],
      });
    expect(res.status).toBe(400);
    expect(res.body.errors[0].message).toMatch(/Invalid option "Flamenco"/);
  });

  it('is backward-compatible: a question-less event ignores answers and still registers', async () => {
    const event = await Event.create({
      title: 'Open Door', description: 'x', eventType: 'meetup', category: 'dance',
      organizerId, organizerSnapshot: { name: 'S', organizationName: '' },
      pricingMode: 'fixed', ticketPrice: 0,
      schedule: { startDate: new Date(Date.now() + 7 * 86400000), endDate: new Date(Date.now() + 8 * 86400000), totalDurationMinutes: 120, dayBreakdown: [] },
      location: { type: 'physical', city: 'Pune', state: 'MH', country: 'IN' },
      maxParticipants: 24, status: 'live',
    });
    const res = await request(app).post(`/v1/events/${event._id}/register`)
      .set('Authorization', `Bearer ${token}`).set('Idempotency-Key', 'ans-nq-1')
      .send({ quantity: 1, attendees: [{ fullName: 'Aditi', phone: '+919876543210' }], answers: [{ label: 'ghost', value: 'x' }] });
    expect(res.status).toBe(201);
    const reg = await EventRegistration.findById(res.body.data._id).lean();
    expect(reg?.answers ?? []).toEqual([]);
  });
});

describe('Custom-question answers — paid flow (reserve → webhook)', () => {
  it('carries answers on the reservation and copies them onto the paid registration', async () => {
    const event = await makeQuestionedPaidEvent();
    const reserveRes = await request(app).post(`/v1/events/${event._id}/reserve`)
      .set('Authorization', `Bearer ${token}`).set('Idempotency-Key', 'ans-paid-1')
      .send({
        quantity: 1,
        answers: [{ questionId: qid(event, 'Years of training?'), value: '7 years' }],
      });
    expect(reserveRes.status).toBe(201);

    const resv = await EventReservation.findOne({ idempotencyKey: 'ans-paid-1' }).lean();
    expect(resv?.answers?.[0]?.value).toBe('7 years');

    const { raw, sig } = signed({
      event: 'payment.captured',
      payload: { payment: { entity: { id: 'pay_ans', order_id: reserveRes.body.data.razorpayOrderId, amount: 460620 } } },
    });
    const whRes = await request(app).post('/v1/razorpay/webhook')
      .set('x-razorpay-signature', sig).set('Content-Type', 'application/json').send(raw);
    expect(whRes.status).toBe(200);

    const reg = await EventRegistration.findOne({ eventId: event._id }).lean();
    expect(reg?.answers?.[0]).toMatchObject({ label: 'Years of training?', value: '7 years' });
  });

  it('400s a paid reservation that omits a required answer (no reservation created)', async () => {
    const event = await makeQuestionedPaidEvent();
    const res = await request(app).post(`/v1/events/${event._id}/reserve`)
      .set('Authorization', `Bearer ${token}`).set('Idempotency-Key', 'ans-paid-bad')
      .send({ quantity: 1 });
    expect(res.status).toBe(400);
    expect(await EventReservation.countDocuments({ eventId: event._id })).toBe(0);
  });
});
