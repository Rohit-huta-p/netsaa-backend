import request from 'supertest';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import app from '../server';
import Event from '../models/Event';
import EventRegistration from '../models/EventRegistration';
import Refund from '../models/Refund';
import EventCancellation from '../models/EventCancellation';

process.env.JWT_SECRET = 'test-secret';

jest.mock('../services/razorpay', () => ({
  ...jest.requireActual('../services/razorpay'),
  createRefund: jest.fn().mockResolvedValue({ refundId: 'rfnd_TEST1' }),
}));

const userId = new mongoose.Types.ObjectId().toString();
const token = jwt.sign({ id: userId, role: 'artist' }, process.env.JWT_SECRET);

async function paidEventWithPolicy(policy: any) {
  return Event.create({
    title: 'Kathak Foundations', description: 'x', eventType: 'workshop', category: 'dance',
    organizerId: new mongoose.Types.ObjectId(),
    organizerSnapshot: { name: 'Saswati', organizationName: 'Sawai' },
    pricingMode: 'fixed', ticketPrice: 4500, cancellationPolicy: policy,
    schedule: { startDate: new Date(Date.now() + 7 * 86400000), endDate: new Date(Date.now() + 8 * 86400000), totalDurationMinutes: 120, dayBreakdown: [] },
    location: { type: 'physical', city: 'Pune', state: 'MH', country: 'IN' },
    maxParticipants: 24, status: 'live',
  });
}

async function makeRegistration(eventId: any) {
  return EventRegistration.create({
    eventId, userId, quantity: 1, status: 'registered', idempotencyKey: `reg-${Date.now()}`,
    source: 'standard', visibility: 'public',
    paymentRecord: { razorpayPaymentId: 'pay_1', capturedAt: new Date(), amountPaise: 460620, serviceFeePaise: 10620, netsaFeePaise: 2250, organizerNetPaise: 447750 },
  });
}

describe('POST /v1/registrations/:id/cancel (attendee)', () => {
  it('full-window cancel creates a pending Refund for the ticket amount', async () => {
    const event = await paidEventWithPolicy({ fullRefundUntil: new Date(Date.now() + 6 * 86400000).toISOString() });
    const reg = await makeRegistration(event._id);

    const res = await request(app).post(`/v1/registrations/${reg._id}/cancel`)
      .set('Authorization', `Bearer ${token}`).send({ reason: 'Schedule conflict' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('cancelled');

    const refund = await Refund.findOne({ registrationId: reg._id });
    expect(refund?.refundAmountPaise).toBe(450000); // ticket only
    expect(refund?.netsaAbsorbedPaise).toBe(0);
    expect(refund?.status).toBe('pending');

    const updated = await EventRegistration.findById(reg._id);
    expect(updated?.cancelledBy).toBe('attendee');
  });

  it('no-window cancel cancels without a Refund row', async () => {
    const event = await paidEventWithPolicy({ fullRefundUntil: new Date(Date.now() - 86400000).toISOString() });
    const reg = await makeRegistration(event._id);

    const res = await request(app).post(`/v1/registrations/${reg._id}/cancel`)
      .set('Authorization', `Bearer ${token}`).send({ reason: 'Changed my mind' });

    expect(res.status).toBe(200);
    expect(await Refund.countDocuments({ registrationId: reg._id })).toBe(0);
  });

  it('403s for a non-owner', async () => {
    const event = await paidEventWithPolicy({});
    const reg = await makeRegistration(event._id);
    const other = jwt.sign({ id: new mongoose.Types.ObjectId().toString(), role: 'artist' }, process.env.JWT_SECRET!);
    const res = await request(app).post(`/v1/registrations/${reg._id}/cancel`).set('Authorization', `Bearer ${other}`).send({ reason: 'x' });
    expect(res.status).toBe(403);
  });
});

describe('POST /v1/events/:id/cancel (organizer)', () => {
  it('cancels the event, refunds every paid attendee in full + service fee, writes one audit row', async () => {
    const organizerId = new mongoose.Types.ObjectId().toString();
    const orgToken = jwt.sign({ id: organizerId, role: 'organizer' }, process.env.JWT_SECRET!);
    const event = await Event.create({
      title: 'Kathak', description: 'x', eventType: 'workshop', category: 'dance',
      organizerId, organizerSnapshot: { name: 'Saswati', organizationName: 'Sawai' },
      pricingMode: 'fixed', ticketPrice: 4500,
      schedule: { startDate: new Date(Date.now() + 7 * 86400000), endDate: new Date(Date.now() + 8 * 86400000), totalDurationMinutes: 120, dayBreakdown: [] },
      location: { type: 'physical', city: 'Pune', state: 'MH', country: 'IN' },
      maxParticipants: 24, status: 'live',
    });
    // two paid attendees
    for (let i = 0; i < 2; i++) {
      await EventRegistration.create({
        eventId: event._id, userId: new mongoose.Types.ObjectId(), quantity: 1, status: 'registered',
        idempotencyKey: `r-${i}`, source: 'standard', visibility: 'public',
        paymentRecord: { razorpayPaymentId: `pay_${i}`, capturedAt: new Date(), amountPaise: 460620, serviceFeePaise: 10620, netsaFeePaise: 2250, organizerNetPaise: 447750 },
      });
    }

    const res = await request(app).post(`/v1/events/${event._id}/cancel`)
      .set('Authorization', `Bearer ${orgToken}`).send({ reason: 'Family emergency' });

    expect(res.status).toBe(200);
    expect((await Event.findById(event._id))?.status).toBe('cancelled');

    const refunds = await Refund.find({ eventId: event._id });
    expect(refunds).toHaveLength(2);
    expect(refunds[0].refundAmountPaise).toBe(460620);  // ticket + service fee
    expect(refunds[0].netsaAbsorbedPaise).toBe(10620);  // NETSA covers the fee

    const audit = await EventCancellation.findOne({ eventId: event._id });
    expect(audit?.affectedRegistrationsCount).toBe(2);
    expect(audit?.netsaAbsorbedTotalPaise).toBe(21240); // 2 × ₹106.20
  });

  it('403s when a non-organizer tries to cancel', async () => {
    const event = await paidEventWithPolicy({});
    const res = await request(app).post(`/v1/events/${event._id}/cancel`).set('Authorization', `Bearer ${token}`).send({ reason: 'x' });
    expect(res.status).toBe(403);
  });
});
