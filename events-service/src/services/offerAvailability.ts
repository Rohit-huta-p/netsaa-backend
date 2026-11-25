import { Types } from 'mongoose';
import EventRegistration from '../models/EventRegistration';
import EventReservation from '../models/EventReservation';

/**
 * Seats already consumed per offer `name` for an event — feeds the resolver's `seatLimit` check.
 *
 * Counts durable registrations that used an offer (non-cancelled) plus reservations still held
 * (`reserved`). A `paid` reservation is NOT counted: `confirmReservationPaid` has already created
 * its registration, which the first query covers — so paid holds aren't double-counted.
 */
export async function seatsUsedByOffer(eventId: Types.ObjectId | string): Promise<Record<string, number>> {
  const _id = new Types.ObjectId(String(eventId));
  const [regs, resv] = await Promise.all([
    EventRegistration.aggregate<{ _id: string; seats: number }>([
      { $match: { eventId: _id, 'appliedOffer.name': { $type: 'string' }, status: { $in: ['registered', 'approved', 'attended', 'pending'] } } },
      { $group: { _id: '$appliedOffer.name', seats: { $sum: '$quantity' } } },
    ]),
    EventReservation.aggregate<{ _id: string; seats: number }>([
      { $match: { eventId: _id, 'appliedOffer.name': { $type: 'string' }, status: 'reserved' } },
      { $group: { _id: '$appliedOffer.name', seats: { $sum: '$quantity' } } },
    ]),
  ]);
  const out: Record<string, number> = {};
  for (const r of [...regs, ...resv]) out[r._id] = (out[r._id] ?? 0) + (r.seats ?? 0);
  return out;
}
