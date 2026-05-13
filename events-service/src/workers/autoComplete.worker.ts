import cron from 'node-cron';
import Event from '../models/Event';
import EventRegistration from '../models/EventRegistration';

export async function sweepAutoComplete(): Promise<{ eventsCompleted: number; registrationsFlipped: number }> {
    const cutoff = new Date(Date.now() - 72 * 3600_000);

    const events = await Event.find({
        status: 'live',
        startsAt: { $lt: cutoff },
    }).select('_id').lean();

    let registrationsFlipped = 0;
    for (const ev of events) {
        const r = await EventRegistration.updateMany(
            { eventId: (ev as any)._id, status: 'confirmed' },
            { $set: { status: 'attended', attendedMarkedAt: new Date(), attendedMarkedBy: 'system' } }
        );
        registrationsFlipped += r.modifiedCount ?? 0;

        await Event.findByIdAndUpdate((ev as any)._id, { status: 'completed' });
    }

    return { eventsCompleted: events.length, registrationsFlipped };
}

export function startAutoCompleteWorker() {
    cron.schedule('45 */6 * * *', async () => {
        // Every 6 hours at :45
        try {
            const r = await sweepAutoComplete();
            if (r.eventsCompleted > 0) console.log('[auto-complete] completed', r);
        } catch (err) {
            console.error('[auto-complete] FAILED', err);
        }
    });
    console.log('[auto-complete] scheduled (every 6h @ :45)');
}
