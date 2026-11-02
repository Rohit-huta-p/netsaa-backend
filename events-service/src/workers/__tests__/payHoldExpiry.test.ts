import mongoose from 'mongoose';
import Event from '../../models/Event';
import EventRegistration from '../../models/EventRegistration';
import EventReservation from '../../models/EventReservation';
import EventNotification from '../../models/EventNotification';
import { slotsLeftForEvent } from '../../services/waitlistService';
import { sweepLapsedPayHolds } from '../payHoldExpiryWorker';

// A paid, single-seat event (ticketPrice > 0 is what makes an approval a *paid* hold).
async function paidEvent(maxParticipants = 1) {
  return Event.create({
    title: 'Kathak Intensive', description: 'x', eventType: 'workshop', category: 'dance',
    organizerId: new mongoose.Types.ObjectId(), organizerSnapshot: { name: 'S', organizationName: 'Sawai' },
    pricingMode: 'fixed', ticketPrice: 500,
    schedule: { startDate: new Date(Date.now() + 7 * 86400000), endDate: new Date(Date.now() + 8 * 86400000), totalDurationMinutes: 120, dayBreakdown: [] },
    location: { type: 'physical', city: 'Pune', state: 'MH', country: 'IN' },
    maxParticipants, status: 'live',
  });
}

// An approved registration + its linked pay-after-approval hold (as doApprove creates them).
async function approvedHold(
  eventId: mongoose.Types.ObjectId,
  opts: { key: string; expiresAt: Date; regStatus?: string; resvStatus?: 'reserved' | 'paid' | 'expired' | 'released' },
) {
  const { key, expiresAt, regStatus = 'approved', resvStatus = 'reserved' } = opts;
  const userId = new mongoose.Types.ObjectId();
  const reg = await EventRegistration.create({
    eventId, userId, quantity: 1, status: regStatus, idempotencyKey: `reg-${key}`,
  });
  const resv = await EventReservation.create({
    eventId, userId, quantity: 1, totalAmount: 500, status: resvStatus,
    registrationId: reg._id, expiresAt, razorpayOrderId: `order_${key}`, idempotencyKey: `approve-${key}`,
  });
  return { reg, resv, userId };
}

const PAST = () => new Date(Date.now() - 1000);
const FUTURE = () => new Date(Date.now() + 36 * 60 * 60 * 1000); // ~36h left

describe('sweepLapsedPayHolds', () => {
  it('(a) reverts a lapsed approved paid reg to cancelled and frees the held seat', async () => {
    const e = await paidEvent(1);
    const { reg } = await approvedHold(e._id, { key: 'lapsed', expiresAt: PAST() });

    // The approved reg holds the only seat.
    expect(await slotsLeftForEvent(e._id)).toBe(0);

    const reverted = await sweepLapsedPayHolds();
    expect(reverted).toBe(1);

    const after = await EventRegistration.findById(reg._id);
    expect(after?.status).toBe('cancelled');
    expect(after?.cancelledBy).toBe('system');
    expect(after?.cancellationReason).toMatch(/48 hours/i);

    // Seat is released.
    expect(await slotsLeftForEvent(e._id)).toBe(1);

    // Attendee was notified (non-fatal path still fires on success).
    const notes = await EventNotification.find({ eventId: e._id, kind: 'cancellation' });
    expect(notes).toHaveLength(1);
  });

  it('(b) leaves an approved reg still inside its 48h window untouched', async () => {
    const e = await paidEvent(1);
    const { reg } = await approvedHold(e._id, { key: 'fresh', expiresAt: FUTURE() });

    const reverted = await sweepLapsedPayHolds();
    expect(reverted).toBe(0);

    const after = await EventRegistration.findById(reg._id);
    expect(after?.status).toBe('approved');
    expect(await slotsLeftForEvent(e._id)).toBe(0); // seat still held
  });

  it('(c) never clobbers a reg the webhook already confirmed to registered (race)', async () => {
    const e = await paidEvent(1);
    // Webhook sets reg->registered first, then reservation->paid; if the sweep runs in between,
    // the reservation is still non-paid and past expiry, but the reg must not be touched.
    const { reg } = await approvedHold(e._id, { key: 'race', expiresAt: PAST(), regStatus: 'registered', resvStatus: 'reserved' });

    const reverted = await sweepLapsedPayHolds();
    expect(reverted).toBe(0);

    const after = await EventRegistration.findById(reg._id);
    expect(after?.status).toBe('registered');
  });

  it('(d) is idempotent — a second pass reverts nothing', async () => {
    const e = await paidEvent(1);
    await approvedHold(e._id, { key: 'twice', expiresAt: PAST() });

    expect(await sweepLapsedPayHolds()).toBe(1);
    expect(await sweepLapsedPayHolds()).toBe(0);
  });

  it('(e) still reverts when the reservation worker already flipped the hold to expired', async () => {
    // Real-world: the 60s reservationExpiryWorker usually beats this 5-min worker, so the
    // reservation is already `expired` while the reg is still stuck `approved`. We match on
    // $ne:'paid', so the reg is still reverted.
    const e = await paidEvent(1);
    const { reg } = await approvedHold(e._id, { key: 'presweep', expiresAt: PAST(), resvStatus: 'expired' });

    const reverted = await sweepLapsedPayHolds();
    expect(reverted).toBe(1);

    const after = await EventRegistration.findById(reg._id);
    expect(after?.status).toBe('cancelled');
    expect(await slotsLeftForEvent(e._id)).toBe(1);
  });

  it('(f) ignores a completed (paid) reservation', async () => {
    const e = await paidEvent(1);
    const { reg } = await approvedHold(e._id, { key: 'paid', expiresAt: PAST(), regStatus: 'registered', resvStatus: 'paid' });

    const reverted = await sweepLapsedPayHolds();
    expect(reverted).toBe(0);

    const after = await EventRegistration.findById(reg._id);
    expect(after?.status).toBe('registered');
  });
});
