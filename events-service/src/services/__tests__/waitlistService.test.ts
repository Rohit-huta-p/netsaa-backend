import mongoose from 'mongoose';
import Event from '../../models/Event';
import EventRegistration from '../../models/EventRegistration';
import WaitlistEntry from '../../models/WaitlistEntry';
import { slotsLeftForEvent, nextPosition, promoteFromWaitlist } from '../waitlistService';

async function makeEvent(over: any = {}) {
  return Event.create({
    title: 'Kathak', description: 'x', eventType: 'workshop', category: 'dance',
    organizerId: new mongoose.Types.ObjectId(), organizerSnapshot: { name: 'S', organizationName: 'Sawai' },
    pricingMode: 'fixed', ticketPrice: 4500,
    schedule: { startDate: new Date(Date.now() + 7 * 86400000), endDate: new Date(Date.now() + 8 * 86400000), totalDurationMinutes: 120, dayBreakdown: [] },
    location: { type: 'physical', city: 'Pune', state: 'MH', country: 'IN' },
    maxParticipants: 2, status: 'live', allowWaitlist: true, ...over,
  });
}
async function reg(eventId: any, seats = 1, status = 'registered') {
  return EventRegistration.create({ eventId, userId: new mongoose.Types.ObjectId(), quantity: seats, status, idempotencyKey: `k-${Math.random()}`, source: 'standard', visibility: 'public' });
}
async function wait(eventId: any, position: number) {
  return WaitlistEntry.create({ eventId, userId: new mongoose.Types.ObjectId(), position, quantity: 1, status: 'waiting', attendeeSnapshot: { fullName: 'A', phone: '+910000000000' } });
}

describe('waitlistService', () => {
  it('slotsLeftForEvent counts active registration seats', async () => {
    const e = await makeEvent(); // cap 2
    await reg(e._id, 1);
    expect(await slotsLeftForEvent(e._id)).toBe(1);
    await reg(e._id, 1);
    expect(await slotsLeftForEvent(e._id)).toBe(0);
  });

  it('cancelled registrations do not count against capacity', async () => {
    const e = await makeEvent();
    await reg(e._id, 1, 'cancelled');
    expect(await slotsLeftForEvent(e._id)).toBe(2);
  });

  it('nextPosition increments per event', async () => {
    const e = await makeEvent();
    expect(await nextPosition(e._id)).toBe(1);
    await wait(e._id, 1);
    expect(await nextPosition(e._id)).toBe(2);
  });

  it('promoteFromWaitlist promotes the top entry when auto-promote is on and a seat is free', async () => {
    const e = await makeEvent({ maxParticipants: 1, waitlistAutoPromote: true });
    await wait(e._id, 1);
    const promoted = await promoteFromWaitlist(e._id);
    expect(promoted?.status).toBe('promoted');
    expect(promoted?.promotionExpiresAt).toBeTruthy();
  });

  it('promoteFromWaitlist returns null in manual mode (organizer approves)', async () => {
    const e = await makeEvent({ maxParticipants: 1, waitlistAutoPromote: false });
    await wait(e._id, 1);
    expect(await promoteFromWaitlist(e._id)).toBeNull();
  });

  it('promoteFromWaitlist returns null when no seat is free', async () => {
    const e = await makeEvent({ maxParticipants: 1, waitlistAutoPromote: true });
    await reg(e._id, 1); // fills the only seat
    await wait(e._id, 1);
    expect(await promoteFromWaitlist(e._id)).toBeNull();
  });
});
