import cron, { ScheduledTask } from 'node-cron';
import EventReservation from '../models/EventReservation';
import EventRegistration from '../models/EventRegistration';
import EventNotification from '../models/EventNotification';

// Pay-after-approval holds run on a 48h window (§6a-e), so a coarse cadence is plenty: a
// lapsed seat is freed within ~5 min of expiry — far tighter than the window needs, and much
// cheaper than the reservation worker's 60s tick (that one guards a 10-min pay TTL).
const CRON_SCHEDULE = '*/5 * * * *'; // Every 5 minutes
let isRunning = false;

async function run(): Promise<void> {
    if (isRunning) return; // Guard against overlapping runs
    isRunning = true;

    try {
        const reverted = await sweepLapsedPayHolds();
        if (reverted > 0) {
            console.log(`[PayHoldExpiryWorker] Reverted ${reverted} lapsed approval(s) — seat(s) freed`);
        }
    } catch (error) {
        console.error('[PayHoldExpiryWorker] Error reverting lapsed pay holds:', error);
    } finally {
        isRunning = false;
    }
}

export function startPayHoldExpiryWorker(): ScheduledTask {
    console.log('[PayHoldExpiryWorker] Starting — runs every 5 min');

    const task = cron.schedule(CRON_SCHEDULE, run);

    // Run once immediately on startup to clear any backlog.
    run();

    return task;
}

/**
 * Revert PAID approvals whose 48h payment window lapsed unpaid, freeing the held seat (§6a-e).
 *
 * The gap this closes: a paid approval sets `EventRegistration.status='approved'` — which HOLDS
 * a seat (counted in `slotsLeftForEvent`/`seatsLeftForSpot`) — and links an `EventReservation`
 * with a 48h `expiresAt`. The Razorpay webhook flips `approved → registered` on payment. If the
 * attendee never pays, nothing reverted the registration, so it held the seat forever.
 *
 * Design notes:
 *  - We do NOT touch the linked reservation. It is created with `status:'reserved'`, so the
 *    existing `reservationExpiryWorker` already settles it (reserved + past expiry →
 *    expired/released). The registration side was the actual gap.
 *  - The revert is a conditional update gated on `status:'approved'`, so a registration the
 *    webhook just confirmed to `registered` is never clobbered — this is both race-safe and
 *    idempotent (a second pass finds nothing still `approved` and is a no-op).
 *  - Terminal status is `cancelled` (with `cancelledBy:'system'` + a reason), NOT `declined`:
 *    the host did not reject this request, so `declined` would misread on the roster. `cancelled`
 *    reuses the purpose-built system-cancellation audit fields and surfaces in the roster's
 *    existing `cancelled` group, with a reason that distinguishes it from a user cancellation.
 *
 * Returns the number of approvals actually reverted.
 */
export async function sweepLapsedPayHolds(): Promise<number> {
    // Pay-after-approval holds carry a `registrationId`. A lapsed, unpaid one is past `expiresAt`
    // and not yet `paid` (the webhook marks the reservation `paid` only on capture). We match on
    // `$ne:'paid'` rather than `'reserved'` because the reservation worker may already have flipped
    // it to `expired`/`released` — the registration can still be stuck `approved`.
    const lapsed = await EventReservation.find({
        registrationId: { $exists: true },
        status: { $ne: 'paid' },
        expiresAt: { $lt: new Date() },
    }).lean();

    let reverted = 0;
    for (const resv of lapsed) {
        if (!resv.registrationId) continue; // defensive — $exists guarantees it, but keep TS happy

        const now = new Date();
        const result = await EventRegistration.updateOne(
            { _id: resv.registrationId, status: 'approved' },
            {
                $set: {
                    status: 'cancelled',
                    cancelledAt: now,
                    cancelledBy: 'system',
                    cancellationReason: 'Payment not completed within 48 hours of approval.',
                },
            },
        );

        // modifiedCount 0 → the webhook already confirmed it (approved → registered), or a prior
        // pass already reverted it. Either way, leave it be.
        if ((result.modifiedCount ?? 0) !== 1) continue;
        reverted++;

        // Let the attendee know their seat was released (non-fatal — mirrors the approval notice).
        try {
            await EventNotification.create({
                eventId: resv.eventId,
                kind: 'cancellation',
                channels: ['push', 'email'],
                audience: 'custom',
                customAudienceUserIds: resv.userId ? [resv.userId] : [],
                body: "Your approval expired — payment wasn't completed in time, so your seat has been released.",
                scheduledAt: now,
                status: 'queued',
            });
        } catch { /* non-fatal */ }
    }

    return reverted;
}
