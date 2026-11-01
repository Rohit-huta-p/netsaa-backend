import { Types } from 'mongoose';
import Event from '../models/Event';
import EventRegistration from '../models/EventRegistration';
import WaitlistEntry from '../models/WaitlistEntry';
import EventNotification from '../models/EventNotification';

export const PROMOTION_WINDOW_MS = 30 * 60 * 1000;

/** Seats remaining = capacity − sum(quantity of active registrations). */
export async function slotsLeftForEvent(eventId: any): Promise<number> {
  const event = await Event.findById(eventId);
  if (!event) return 0;
  const agg = await EventRegistration.aggregate([
    // 'approved' = a paid request approved + awaiting payment holds its seat (§6a-e).
    { $match: { eventId: event._id, status: { $in: ['registered', 'attended', 'approved'] } } },
    { $group: { _id: null, seats: { $sum: '$quantity' } } },
  ]);
  const taken = agg[0]?.seats ?? 0;
  return Math.max(0, (event.maxParticipants || 0) - taken);
}

/** Seats remaining for ONE spot/tier = spot.capacity − sum(quantity of active regs
 *  for that spot). Takes the already-loaded event to avoid a redundant read. */
export async function seatsLeftForSpot(event: any, spotId: any): Promise<number> {
  const spot = (event?.spots ?? []).find((s: any) => String(s._id) === String(spotId));
  if (!spot) return 0;
  const agg = await EventRegistration.aggregate([
    { $match: { eventId: event._id, spotId: new Types.ObjectId(String(spotId)), status: { $in: ['registered', 'attended', 'approved'] } } },
    { $group: { _id: null, seats: { $sum: '$quantity' } } },
  ]);
  const taken = agg[0]?.seats ?? 0;
  return Math.max(0, (spot.capacity || 0) - taken);
}

export async function nextPosition(eventId: any): Promise<number> {
  const last = await WaitlistEntry.findOne({ eventId }).sort({ position: -1 });
  return (last?.position ?? 0) + 1;
}

/** Promote a specific entry into a 30-min confirm window. */
export async function promoteEntry(entry: any): Promise<any> {
  entry.status = 'promoted';
  entry.promotedAt = new Date();
  entry.promotionExpiresAt = new Date(Date.now() + PROMOTION_WINDOW_MS);
  await entry.save();
  try {
    await EventNotification.create({ eventId: entry.eventId, kind: 'waitlist_promoted', channels: ['push', 'email'], audience: 'custom', customAudienceUserIds: [entry.userId], body: 'A seat opened for your waitlisted event — confirm within 30 minutes.', scheduledAt: new Date(), status: 'queued' });
  } catch { /* non-fatal */ }
  return entry;
}

/** AUTO path: promote the top waiting entry iff a seat is free AND the event auto-promotes.
 *  Manual-mode events return null — the organizer drives promotion explicitly. */
export async function promoteFromWaitlist(eventId: any): Promise<any | null> {
  const event = await Event.findById(eventId);
  if (!event || !event.allowWaitlist || !event.waitlistAutoPromote) return null;
  if ((await slotsLeftForEvent(eventId)) <= 0) return null;
  const top = await WaitlistEntry.findOne({ eventId, status: 'waiting' }).sort({ position: 1 });
  if (!top) return null;
  return promoteEntry(top);
}
