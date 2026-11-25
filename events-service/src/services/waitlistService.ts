import { Types } from 'mongoose';
import Event from '../models/Event';
import EventRegistration from '../models/EventRegistration';
import WaitlistEntry from '../models/WaitlistEntry';
import EventNotification from '../models/EventNotification';

/** Seats remaining = capacity − sum(quantity of active registrations) − held promotions. */
export async function slotsLeftForEvent(eventId: any): Promise<number> {
  const event = await Event.findById(eventId);
  if (!event) return 0;
  const agg = await EventRegistration.aggregate([
    // 'approved' = a paid request approved + awaiting payment holds its seat (§6a-e).
    { $match: { eventId: event._id, status: { $in: ['registered', 'attended', 'approved'] } } },
    { $group: { _id: null, seats: { $sum: '$quantity' } } },
  ]);
  const taken = agg[0]?.seats ?? 0;
  // A PROMOTED waitlist entry holds its seat — the offer stands until the event ends,
  // so it counts against capacity. Without this the host could re-promote the same seat
  // (oversell) and the "Promote" button would never disable. Freed on confirm/decline.
  const held = await WaitlistEntry.aggregate([
    { $match: { eventId: event._id, status: 'promoted' } },
    { $group: { _id: null, seats: { $sum: '$quantity' } } },
  ]);
  const reserved = held[0]?.seats ?? 0;
  return Math.max(0, (event.maxParticipants || 0) - taken - reserved);
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

/** Promote an entry: hold the seat and offer it until the event ends — no short timer.
 *  The waitlister already opted in, so they confirm whenever (up to the event). The seat
 *  is held via slotsLeftForEvent until they confirm, decline, or the event passes. */
export async function promoteEntry(entry: any, event?: any): Promise<any> {
  const ev = event ?? (await Event.findById(entry.eventId));
  const endsAt = ev?.schedule?.endDate ?? ev?.endsAt ?? ev?.startsAt;
  entry.status = 'promoted';
  entry.promotedAt = new Date();
  entry.promotionExpiresAt = endsAt ? new Date(endsAt) : undefined;
  await entry.save();
  try {
    await EventNotification.create({ eventId: entry.eventId, kind: 'waitlist_promoted', channels: ['push', 'email'], audience: 'custom', customAudienceUserIds: [entry.userId], body: 'A seat opened for your waitlisted event — it’s yours. Confirm anytime before the event to claim it.', scheduledAt: new Date(), status: 'queued' });
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
  return promoteEntry(top, event);
}
