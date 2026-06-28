import mongoose from 'mongoose';
import Event from '../../models/Event';
import WaitlistEntry from '../../models/WaitlistEntry';
import { sweepExpiredPromotions } from '../waitlistExpiryWorker';

async function evt() {
  return Event.create({
    title: 'K', description: 'x', eventType: 'workshop', category: 'dance',
    organizerId: new mongoose.Types.ObjectId(), organizerSnapshot: { name: 'S', organizationName: 'Sawai' },
    pricingMode: 'fixed', ticketPrice: 0,
    schedule: { startDate: new Date(Date.now() + 7 * 86400000), endDate: new Date(Date.now() + 8 * 86400000), totalDurationMinutes: 120, dayBreakdown: [] },
    location: { type: 'physical', city: 'Pune', state: 'MH', country: 'IN' },
    maxParticipants: 1, status: 'live', allowWaitlist: true, waitlistAutoPromote: true,
  });
}

describe('sweepExpiredPromotions', () => {
  it('expires a stale promotion and cascades to the next waiter', async () => {
    const e = await evt();
    await WaitlistEntry.create({ eventId: e._id, userId: new mongoose.Types.ObjectId(), position: 1, quantity: 1, status: 'promoted', promotedAt: new Date(Date.now() - 31 * 60000), promotionExpiresAt: new Date(Date.now() - 1000), attendeeSnapshot: { fullName: 'A', phone: '+910000000000' } });
    await WaitlistEntry.create({ eventId: e._id, userId: new mongoose.Types.ObjectId(), position: 2, quantity: 1, status: 'waiting', attendeeSnapshot: { fullName: 'B', phone: '+910000000001' } });

    await sweepExpiredPromotions();

    const first = await WaitlistEntry.findOne({ eventId: e._id, position: 1 });
    const second = await WaitlistEntry.findOne({ eventId: e._id, position: 2 });
    expect(first?.status).toBe('expired');
    expect(second?.status).toBe('promoted'); // cascaded (seat is free again)
  });
});
