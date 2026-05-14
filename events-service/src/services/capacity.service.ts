import Event from '../models/Event';
import { emit } from '../utils/observability';

export type ReserveResult =
    | { ok: true; event: any }
    | { ok: false; reason: 'full_or_inactive' };

/**
 * Atomic single-doc increment with $expr guard. Mongo serializes concurrent
 * updates on the same doc, so racing RSVPs all use the same fresh
 * (total, registeredCount) snapshot — only as many as `total - existing`
 * succeed. Returns null for everyone past the cap.
 *
 * Why $expr instead of stored slotsLeft: avoids the drift surface of two
 * fields needing to stay in sync. registeredCount is the single source of truth.
 */
/**
 * Multi-seat atomic reserve. registeredCount counts ATTENDEES, not registrations.
 * One registration with attendeeCount=3 increments registeredCount by 3.
 *
 * $expr guard: total - registeredCount >= seats requested. The aggregation
 * expression evaluates against the fresh doc per request, so Mongo's
 * single-doc serialization gives us correct sold-out semantics under load.
 *
 * @param eventId Mongo ObjectId of the Event
 * @param seats Number of attendees (1-5). Defaults to 1 (back-compat with
 *              single-seat callers like the race test).
 */
export async function reserveSpots(eventId: string, seats: number = 1): Promise<ReserveResult> {
    if (seats < 1 || seats > 5) {
        return { ok: false, reason: 'full_or_inactive' };
    }

    const updated = await Event.findOneAndUpdate(
        {
            _id: eventId,
            status: 'live',
            $expr: {
                $gte: [
                    { $subtract: ['$capacity.total', '$capacity.registeredCount'] },
                    seats,
                ],
            },
        },
        { $inc: { 'capacity.registeredCount': seats } },
        { new: true }
    );

    if (!updated) {
        return { ok: false, reason: 'full_or_inactive' };
    }
    return { ok: true, event: updated };
}

/**
 * Back-compat alias for single-seat reserve. Used by the Task 23 race test
 * and any caller that hasn't migrated to seats yet.
 */
export async function reserveSpot(eventId: string): Promise<ReserveResult> {
    return reserveSpots(eventId, 1);
}

/**
 * Compensation. Best-effort multi-seat release. Drift is acceptable here
 * because the daily reconciliation cron (Task 5) recomputes registeredCount
 * from EventRegistration truth and corrects any mismatch.
 */
export async function releaseSpots(eventId: string, seats: number = 1): Promise<void> {
    try {
        await Event.findByIdAndUpdate(eventId, {
            $inc: { 'capacity.registeredCount': -Math.abs(seats) },
        });
    } catch (e) {
        // Swallow. Reconciliation cron will heal the drift.
        emit('reservation_compensation_failed', 'error', {
            eventId,
            seats,
            error: String(e),
        });
    }
}

/** Back-compat single-seat release. */
export async function releaseSpot(eventId: string): Promise<void> {
    return releaseSpots(eventId, 1);
}

/**
 * Read-only check, used for UI hint display before user taps Register.
 * Not authoritative — actual reservation goes through reserveSpot.
 */
export async function isCapacityAvailable(eventId: string): Promise<boolean> {
    const ev = await Event.findById(eventId).select('capacity status').lean();
    if (!ev) return false;
    if ((ev as any).status !== 'live') return false;
    return (ev as any).capacity.registeredCount < (ev as any).capacity.total;
}
