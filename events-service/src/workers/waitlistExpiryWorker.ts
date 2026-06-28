import WaitlistEntry from '../models/WaitlistEntry';
import { promoteFromWaitlist } from '../services/waitlistService';

/** Expire promotions whose 30-min window lapsed, then cascade to the next waiter. */
export async function sweepExpiredPromotions(): Promise<number> {
  const stale = await WaitlistEntry.find({ status: 'promoted', promotionExpiresAt: { $lt: new Date() } });
  const affectedEvents = new Set<string>();

  for (const entry of stale) {
    entry.status = 'expired';
    await entry.save();
    affectedEvents.add(entry.eventId.toString());
  }
  // Cascade once per affected event (the freed seat lets the next waiter up)
  for (const eventId of affectedEvents) {
    await promoteFromWaitlist(eventId);
  }
  return stale.length;
}
