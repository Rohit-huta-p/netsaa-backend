import cron from 'node-cron';
import Redis from 'ioredis';
import Event from '../models/Event';
import { publishNotification } from '../services/notificationPublisher.service';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
});

export async function sweepMarkAttendees(): Promise<{ pushed: number }> {
    const windowStart = new Date(Date.now() - 25 * 3600_000);
    const windowEnd = new Date(Date.now() - 23 * 3600_000);

    const events = await Event.find({
        status: 'live',
        startsAt: { $gte: windowStart, $lte: windowEnd },
    }).select('_id organizerId title').lean();

    let pushed = 0;
    for (const ev of events) {
        const idemKey = `event:${(ev as any)._id}:mark_attendees_prompt`;
        const already = await redis.get(idemKey).catch(() => null);
        if (already === 'sent') continue;

        await publishNotification({
            subtype: 'event.mark_attendees_prompt',
            eventId: (ev as any)._id.toString(),
            organizerId: (ev as any).organizerId?.toString(),
            title: (ev as any).title,
        });

        await redis.set(idemKey, 'sent', 'EX', 7 * 24 * 3600).catch(() => {});
        pushed++;
    }
    return { pushed };
}

export function startMarkAttendeesWorker() {
    // Once an hour at :15 past
    cron.schedule('15 * * * *', async () => {
        try {
            const r = await sweepMarkAttendees();
            if (r.pushed > 0) console.log('[mark-attendees] pushed', r.pushed);
        } catch (err) {
            console.error('[mark-attendees] FAILED', err);
        }
    });
    console.log('[mark-attendees] scheduled (hourly @ :15)');
}
