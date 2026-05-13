import EventRegistration from '../models/EventRegistration';
import { publishNotification } from './notificationPublisher.service';

const BATCH_SIZE = 50;
const BATCH_DELAY_MS = 5000; // 50 messages / 5s = 10 msg/s (matches MSG91 standard rate)

export interface RescheduleFanoutParams {
    eventId: string;
    oldStartsAt: string;
    newStartsAt: string;
    title: string;
    reason?: string;
}

export async function fanoutReschedule(params: RescheduleFanoutParams): Promise<{ notified: number; batches: number }> {
    const regs = await EventRegistration.find({
        eventId: params.eventId,
        status: { $in: ['confirmed', 'attended'] },
    }).select('userId').lean();

    if (regs.length === 0) return { notified: 0, batches: 0 };

    const batches = Math.ceil(regs.length / BATCH_SIZE);
    let notified = 0;

    for (let i = 0; i < batches; i++) {
        const chunk = regs.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE);
        await Promise.all(chunk.map((r: any) => publishNotification({
            subtype: 'event.rescheduled',
            eventId: params.eventId,
            userId: r.userId.toString(),
            title: params.title,
            oldStartsAt: params.oldStartsAt,
            newStartsAt: params.newStartsAt,
            reason: params.reason,
        })));
        notified += chunk.length;

        // Throttle between batches (skip in test)
        if (i < batches - 1 && process.env.NODE_ENV !== 'test') {
            await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
        }
    }

    return { notified, batches };
}
