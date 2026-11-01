import { Types } from 'mongoose';

/**
 * Spot / ticket-tier selection on registration (gap §6a-b).
 *
 * Events carry an embedded `spots[]` (name/capacity/price, stable _ids — see
 * composerMapping.buildSpots). The simplified composer always writes exactly one
 * invisible "General" spot, so most events have a single spot and need no picker;
 * multi-spot events must send which one. This resolves that choice, purely, so it
 * can be unit-tested without a DB.
 */

export interface EventSpot {
  _id?: Types.ObjectId;   // present at runtime (Mongoose subdoc id); the IEvent type omits it
  name: string;
  capacity: number;
  price: number;
}

export interface SpotResolution {
  /** The resolved spot. Undefined for a spot-less legacy event → caller falls
   *  back to event.ticketPrice / event-level capacity. */
  spot?: EventSpot;
  /** Set → caller should 400 with this message. */
  error?: string;
  /** The resolved spot has a price > 0 (the free register path should 409 and
   *  route the attendee to /reserve). */
  requiresPayment?: boolean;
}

/**
 * Resolve the spot an attendee picked against the event's embedded spots.
 *  - no spots on the event → {} (legacy; use event.ticketPrice + event capacity)
 *  - a spotId that matches no spot → error
 *  - multiple spots and no spotId → error (the client must choose)
 *  - exactly one spot and no spotId → default to it
 */
export function resolveSpot(event: { spots?: EventSpot[] } | null | undefined, spotId: unknown): SpotResolution {
  const spots = event?.spots ?? [];
  if (!spots.length) return {};

  if (spotId != null && String(spotId).trim()) {
    const spot = spots.find((s) => String(s._id) === String(spotId));
    if (!spot) return { error: 'Unknown spot for this event' };
    return { spot, requiresPayment: (spot.price || 0) > 0 };
  }

  if (spots.length > 1) return { error: 'spotId is required: this event has multiple options' };

  const spot = spots[0];
  return { spot, requiresPayment: (spot.price || 0) > 0 };
}
