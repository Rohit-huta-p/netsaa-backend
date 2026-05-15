import cron from 'node-cron';
import EventRegistration from '../models/EventRegistration';
import { releaseSpots } from '../services/capacity.service';
import { emit } from '../utils/observability';

const STALE_AFTER_MINUTES = 15;

/**
 * Sweep stale pending registrations.
 *
 * A registration is "stale pending" when:
 *   - paymentStatus === 'pending'   (Razorpay order created, no payment.captured yet)
 *   - status === 'pending_payment'  (held seat — counts toward capacity)
 *   - createdAt < 15 minutes ago    (matches Razorpay order TTL — order is no
 *                                   longer payable on their side either)
 *
 * For each match: flip to cancelled + paymentStatus=failed and call
 * releaseSpots(attendeeCount). releaseSpots is best-effort; any drift will
 * be healed by the nightly reconciliation cron.
 *
 * cancelReason is included in $set as audit intent — note the field is not
 * on the schema, so mongoose strict mode silently drops it from the row.
 * The reason is captured in the emit() observability line, which is the
 * actual audit trail.
 */
export async function sweepStalePending(): Promise<{ cancelled: number; seatsReleased: number }> {
    const cutoff = new Date(Date.now() - STALE_AFTER_MINUTES * 60_000);

    const stale = await EventRegistration.find({
        paymentStatus: 'pending',
        status: 'pending_payment',
        createdAt: { $lt: cutoff },
    }).select('_id eventId attendeeCount').lean();

    if (stale.length === 0) return { cancelled: 0, seatsReleased: 0 };

    const ids = stale.map((r: any) => r._id);
    await EventRegistration.updateMany(
        { _id: { $in: ids } },
        {
            $set: {
                status: 'cancelled',
                paymentStatus: 'failed',
                cancelledAt: new Date(),
                cancelReason: 'payment_abandoned',
            },
        }
    );

    let seatsReleased = 0;
    for (const r of stale) {
        const seats = (r as any).attendeeCount ?? 1;
        await releaseSpots((r as any).eventId.toString(), seats);
        seatsReleased += seats;
    }

    emit('stale_pending_cleanup', 'info', {
        cancelled: stale.length,
        seatsReleased,
    });

    return { cancelled: stale.length, seatsReleased };
}

/**
 * Schedule sweepStalePending every 5 minutes. The 5min interval is short
 * enough that abandoned carts don't block fresh registrations for long, and
 * long enough that the work is bounded (only rows older than 15min match).
 */
export function startStalePendingCleanupWorker() {
    cron.schedule('*/5 * * * *', async () => {
        try {
            const r = await sweepStalePending();
            if (r.cancelled > 0) console.log('[stale-pending]', r);
        } catch (err) {
            console.error('[stale-pending] FAILED', err);
        }
    });
    console.log('[stale-pending] scheduled every 5min');
}
