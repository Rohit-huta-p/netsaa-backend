import cron from 'node-cron';
import Redis from 'ioredis';
import Event from '../models/Event';
import { publishNotification } from '../services/notificationPublisher.service';

const URGENCY_THRESHOLD = 0.9;

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
});

export async function sweepUrgency(): Promise<{ flagged: number }> {
    const hits = await Event.aggregate([
        { $match: { status: 'live', 'capacity.total': { $gt: 0 } } },
        {
            $project: {
                title: 1,
                organizerId: 1,
                capacity: 1,
                fillRatio: { $divide: ['$capacity.registeredCount', '$capacity.total'] },
            },
        },
        { $match: { fillRatio: { $gte: URGENCY_THRESHOLD } } },
    ]);

    let flagged = 0;
    for (const ev of hits) {
        const idemKey = `event:${ev._id}:urgency`;
        const already = await redis.get(idemKey).catch(() => null);
        if (already === 'sent') continue;

        const slotsLeft = ev.capacity.total - ev.capacity.registeredCount;
        if (slotsLeft <= 0) continue; // skip full events

        await publishNotification({
            subtype: 'event.capacity_urgency',
            eventId: ev._id.toString(),
            organizerId: ev.organizerId?.toString(),
            title: ev.title,
            slotsLeft,
        });

        // Throttle: same event won't re-fire urgency for 24h
        await redis.set(idemKey, 'sent', 'EX', 24 * 3600).catch(() => {});
        flagged++;
    }

    return { flagged };
}

export function startCapacityUrgencyWorker() {
    cron.schedule('*/30 * * * *', async () => {
        console.log('[capacity-urgency] sweep start');
        try {
            const r = await sweepUrgency();
            console.log('[capacity-urgency] complete', r);
        } catch (err) {
            console.error('[capacity-urgency] FAILED', err);
        }
    });
    console.log('[capacity-urgency] scheduled (every 30min)');
}
