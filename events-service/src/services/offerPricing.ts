import { Types } from 'mongoose';

/**
 * Event offer pricing (Early-bird / group rates).
 *
 * Offers live on the Event (`event.offers`) but were never consumed at registration — the
 * attendee always paid the base spot/ticket price. This resolver is the single source of truth
 * for the *effective* per-ticket price: the lowest-priced offer the buyer qualifies for, else
 * the base price. Pure (no DB, no clock beyond `now`) so the same logic runs on the FE for
 * display and on the BE authoritatively at reserve/approve/capture.
 */

export interface EventOfferInput {
  spotId?: Types.ObjectId | string;
  name: string;
  price: number;                 // rupees; below the spot/base price
  audience: 'everyone' | 'group';
  endsAt?: Date | string;
  seatLimit?: number;            // "first N seats" at this price
  minSeats?: number;             // group offer: needs N+ seats in one booking
}

export interface AppliedOffer {
  name: string;
  unitRupees: number;
  baseUnitRupees: number;
  audience: 'everyone' | 'group';
}

export interface EffectivePrice {
  baseUnitRupees: number;        // the undiscounted per-ticket price
  unitRupees: number;            // what we actually charge per ticket
  appliedOffer?: AppliedOffer;   // set only when an offer beat the base price
}

export interface ResolveOpts {
  spotId?: string | Types.ObjectId | null;
  seats: number;
  now?: Date;
  /** Seats already consumed per offer `name` (for `seatLimit`). Omit to skip seatLimit checks. */
  seatsUsedByOffer?: Record<string, number>;
}

interface PricingEvent {
  ticketPrice?: number;
  spots?: Array<{ _id?: Types.ObjectId | string; price?: number }>;
  offers?: EventOfferInput[];
}

/**
 * Resolve the per-ticket price for a registration.
 *
 * An offer qualifies when ALL hold: it is cheaper than the base price; it is not past `endsAt`;
 * its `spotId` matches the chosen spot (or it is event-wide); its audience fits (`everyone`, or
 * `group` with `seats ≥ minSeats`); and — when a usage map is supplied — `seatLimit` has room
 * for `seats`. Among qualifying offers the cheapest wins. Free tiers never discount.
 */
export function resolveEffectivePrice(event: PricingEvent, opts: ResolveOpts): EffectivePrice {
  const now = opts.now ?? new Date();
  const seats = Math.max(1, Math.floor(opts.seats || 1));
  const spot = opts.spotId
    ? (event.spots ?? []).find((s) => String(s._id) === String(opts.spotId))
    : undefined;
  const baseUnitRupees = spot ? (spot.price || 0) : (event.ticketPrice || 0);

  if (baseUnitRupees <= 0) return { baseUnitRupees, unitRupees: baseUnitRupees };

  const qualifies = (o: EventOfferInput): boolean => {
    if (typeof o.price !== 'number' || o.price < 0 || o.price >= baseUnitRupees) return false;
    if (o.endsAt && new Date(o.endsAt).getTime() <= now.getTime()) return false;
    if (o.spotId && (!spot || String(o.spotId) !== String(spot._id))) return false;
    if (o.audience === 'group') {
      const min = o.minSeats && o.minSeats > 1 ? o.minSeats : 2;
      if (seats < min) return false;
    }
    if (o.seatLimit != null && opts.seatsUsedByOffer) {
      const used = opts.seatsUsedByOffer[o.name] ?? 0;
      if (used + seats > o.seatLimit) return false;
    }
    return true;
  };

  const candidates = (event.offers ?? []).filter(qualifies);
  if (!candidates.length) return { baseUnitRupees, unitRupees: baseUnitRupees };

  const best = candidates.reduce((a, b) => (b.price < a.price ? b : a));
  return {
    baseUnitRupees,
    unitRupees: best.price,
    appliedOffer: { name: best.name, unitRupees: best.price, baseUnitRupees, audience: best.audience },
  };
}
