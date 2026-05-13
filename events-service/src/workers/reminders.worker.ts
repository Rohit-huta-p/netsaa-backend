import cron from 'node-cron';
import Redis from 'ioredis';
import Event from '../models/Event';
import EventRegistration from '../models/EventRegistration';
import { publishNotification } from '../services/notificationPublisher.service';

export type ReminderKind = 'reminder_24h' | 'reminder_2h';

const WINDOW_MINUTES = 15; // sweep cadence — match events in ±7.5min of target offset

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
});

function windowForKind(kind: ReminderKind): { start: Date; end: Date } {
    const now = Date.now();
    const hours = kind === 'reminder_24h' ? 24 : 2;
    const center = now + hours * 3600_000;
    return {
        start: new Date(center - (WINDOW_MINUTES / 2) * 60_000),
        end: new Date(center + (WINDOW_MINUTES / 2) * 60_000),
    };
}

export async function sweepReminders(
    kind: ReminderKind,
): Promise<{ eventsProcessed: number; remindersSent: number }> {
    const { start, end } = windowForKind(kind);

    const events = await Event.find({
        status: 'live',
        startsAt: { $gte: start, $lte: end },
    })
        .select('_id startsAt title')
        .lean();

    let eventsProcessed = 0;
    let remindersSent = 0;

    for (const ev of events) {
        const id = (ev as any)._id;
        const idemKey = `event:${id}:${kind}`;

        const already = await redis.get(idemKey).catch(() => null);
        if (already === 'sent') continue;

        const regs = await EventRegistration.find({
            eventId: id,
            status: 'confirmed',
        })
            .select('userId')
            .lean();

        await Promise.all(
            regs.map((r: any) =>
                publishNotification({
                    subtype:
                        kind === 'reminder_24h'
                            ? 'event.reminder_24h'
                            : 'event.reminder_2h',
                    eventId: id.toString(),
                    userId: r.userId.toString(),
                    title: (ev as any).title,
                }),
            ),
        );

        // Day-bucket TTL — key auto-expires after 25h so next cycle is clean
        await redis
            .set(idemKey, 'sent', 'EX', 25 * 3600)
            .catch((e) => console.warn('[reminders] redis set failed', e));

        eventsProcessed++;
        remindersSent += regs.length;
    }

    return { eventsProcessed, remindersSent };
}

export function startReminderWorkers(): void {
    // T-24h sweep — every 15 min on the quarter hours
    cron.schedule(
        '*/15 * * * *',
        async () => {
            console.log('[reminders.24h] sweep start');
            try {
                const r = await sweepReminders('reminder_24h');
                console.log('[reminders.24h] complete', r);
            } catch (err) {
                console.error('[reminders.24h] FAILED', err);
            }
        },
        { timezone: 'UTC' },
    );

    // T-2h sweep — every 15 min, offset by 7 min so the two sweeps don't collide
    cron.schedule(
        '7,22,37,52 * * * *',
        async () => {
            console.log('[reminders.2h] sweep start');
            try {
                const r = await sweepReminders('reminder_2h');
                console.log('[reminders.2h] complete', r);
            } catch (err) {
                console.error('[reminders.2h] FAILED', err);
            }
        },
        { timezone: 'UTC' },
    );

    console.log('[reminders] both workers scheduled (every 15 min, T-24h and T-2h)');
}
