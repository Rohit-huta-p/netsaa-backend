import request from 'supertest';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import app from '../server';
import Event from '../models/Event';
import UserConsent from '../models/UserConsent';
import UserPayoutAccount from '../models/UserPayoutAccount';
import { DPDP_POLICY_VERSION } from '../utils/consent';

process.env.JWT_SECRET = 'test-secret';

jest.mock('../services/razorpay', () => ({
  ...jest.requireActual('../services/razorpay'),
  createOrderWithTransfer: jest.fn().mockResolvedValue({ orderId: 'order_CONSENT1' }),
}));

const userId = new mongoose.Types.ObjectId().toString();
const token = jwt.sign({ id: userId, role: 'artist' }, process.env.JWT_SECRET);

async function makeFreeEvent() {
  return Event.create({
    title: 'Consent Fixture', description: 'x', eventType: 'workshop', category: 'dance',
    organizerId: new mongoose.Types.ObjectId(), organizerSnapshot: { name: 'S', organizationName: '' },
    pricingMode: 'fixed', ticketPrice: 0,
    schedule: { startDate: new Date(Date.now() + 7 * 86400000), endDate: new Date(Date.now() + 8 * 86400000), totalDurationMinutes: 120, dayBreakdown: [] },
    location: { type: 'physical', city: 'Pune', state: 'MH', country: 'IN' },
    maxParticipants: 24, status: 'live',
  });
}

async function makePaidEvent() {
  const organizerId = new mongoose.Types.ObjectId();
  await UserPayoutAccount.create({
    userId: organizerId, provider: 'razorpay', linkedAccountId: 'acc_CONSENT', status: 'verified',
    businessType: 'individual', panMasked: 'ABCDE****F', accountHolderName: 'S',
    bankLast4: '9012', bankName: 'SBI', ifsc: 'SBIN0007613', submittedAt: new Date(), verifiedAt: new Date(),
  });
  return Event.create({
    title: 'Paid Consent', description: 'x', eventType: 'workshop', category: 'dance',
    organizerId, organizerSnapshot: { name: 'S', organizationName: '' },
    pricingMode: 'fixed', ticketPrice: 4500,
    schedule: { startDate: new Date(Date.now() + 7 * 86400000), endDate: new Date(Date.now() + 8 * 86400000), totalDurationMinutes: 120, dayBreakdown: [] },
    location: { type: 'physical', city: 'Pune', state: 'MH', country: 'IN' },
    maxParticipants: 24, status: 'live',
  });
}

describe('DPDP consent persistence on registration (gap f)', () => {
  it('writes a UserConsent record when the free register carries dpdpConsent', async () => {
    const event = await makeFreeEvent();
    const res = await request(app).post(`/v1/events/${event._id}/register`)
      .set('Authorization', `Bearer ${token}`).set('Idempotency-Key', 'consent-1')
      .send({ quantity: 1, attendees: [{ fullName: 'Aditi', phone: '+919876543210' }], dpdpConsent: true });
    expect(res.status).toBe(201);

    const consents = await UserConsent.find({ userId, scope: 'event_registration' }).lean();
    expect(consents).toHaveLength(1);
    expect(consents[0].version).toBe(DPDP_POLICY_VERSION);
    expect(consents[0].acceptedAt).toBeTruthy();
  });

  it('does NOT write consent when the client omits it (backward-compatible)', async () => {
    const event = await makeFreeEvent();
    const res = await request(app).post(`/v1/events/${event._id}/register`)
      .set('Authorization', `Bearer ${token}`).set('Idempotency-Key', 'consent-none')
      .send({ quantity: 1, attendees: [{ fullName: 'Aditi', phone: '+919876543210' }] });
    expect(res.status).toBe(201);
    expect(await UserConsent.countDocuments({ userId, scope: 'event_registration' })).toBe(0);
  });

  it('is idempotent per version: consenting across two events writes one record', async () => {
    const [a, b] = [await makeFreeEvent(), await makeFreeEvent()];
    await request(app).post(`/v1/events/${a._id}/register`)
      .set('Authorization', `Bearer ${token}`).set('Idempotency-Key', 'consent-a')
      .send({ quantity: 1, attendees: [{ fullName: 'Aditi', phone: '+919876543210' }], dpdpConsent: true });
    await request(app).post(`/v1/events/${b._id}/register`)
      .set('Authorization', `Bearer ${token}`).set('Idempotency-Key', 'consent-b')
      .send({ quantity: 1, attendees: [{ fullName: 'Aditi', phone: '+919876543210' }], dpdpConsent: true });

    expect(await UserConsent.countDocuments({ userId, scope: 'event_registration' })).toBe(1);
  });

  it('records a distinct version when the policy version differs', async () => {
    const event = await makeFreeEvent();
    await request(app).post(`/v1/events/${event._id}/register`)
      .set('Authorization', `Bearer ${token}`).set('Idempotency-Key', 'consent-v2')
      .send({ quantity: 1, attendees: [{ fullName: 'Aditi', phone: '+919876543210' }], dpdpConsent: true, consentVersion: '2099.9' });

    const row = await UserConsent.findOne({ userId, scope: 'event_registration', version: '2099.9' }).lean();
    expect(row).toBeTruthy();
  });

  it('writes consent at reserve time for the paid flow', async () => {
    const event = await makePaidEvent();
    const res = await request(app).post(`/v1/events/${event._id}/reserve`)
      .set('Authorization', `Bearer ${token}`).set('Idempotency-Key', 'consent-paid')
      .send({ quantity: 1, dpdpConsent: true });
    expect(res.status).toBe(201);
    expect(await UserConsent.countDocuments({ userId, scope: 'event_registration' })).toBe(1);
  });
});
