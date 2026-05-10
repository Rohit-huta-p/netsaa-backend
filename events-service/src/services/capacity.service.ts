import Event from '../models/Event';

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
export async function reserveSpot(eventId: string): Promise<ReserveResult> {
    const updated = await Event.findOneAndUpdate(
        {
            _id: eventId,
            status: 'live',
            $expr: { $gt: ['$capacity.total', '$capacity.registeredCount'] },
        },
        { $inc: { 'capacity.registeredCount': 1 } },
        { new: true }
    );

    if (!updated) {
        return { ok: false, reason: 'full_or_inactive' };
    }
    return { ok: true, event: updated };
}

/**
 * Compensation. Best-effort. Drift is acceptable here because the daily
 * reconciliation cron (Task 5) recomputes registeredCount from EventRegistration
 * truth and corrects any mismatch.
 */
export async function releaseSpot(eventId: string): Promise<void> {
    try {
        await Event.findByIdAndUpdate(eventId, {
            $inc: { 'capacity.registeredCount': -1 },
        });
    } catch (e) {
        // Swallow. Reconciliation cron will heal the drift.
        console.warn('releaseSpot compensation failed:', e);
    }
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
