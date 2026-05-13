import { Request, Response } from 'express';
import Event from '../models/Event';
import EventRegistration from '../models/EventRegistration';
import { publishNotification } from '../services/notificationPublisher.service';
import { recordAudit } from '../services/auditLog.service';
import { fanoutReschedule } from '../services/rescheduleFanout.service';

export async function postCancelEvent(req: Request, res: Response) {
    try {
        const userId = (req as any).user?.id;
        const eventId = req.params.id;
        const event = (req as any).event;
        if (!event) return res.status(404).json({ message: 'Event not found' });
        if (event.status === 'cancelled') {
            return res.status(409).json({ message: 'Event already cancelled' });
        }

        const { reason, note } = req.body;

        await Event.findByIdAndUpdate(eventId, {
            status: 'cancelled',
            cancelledAt: new Date(),
            cancelReason: reason,
            cancelNote: note,
        });

        // Fanout to all confirmed/attended registrants
        const registrants = await EventRegistration.find({
            eventId,
            status: { $in: ['confirmed', 'attended'] },
        }).select('userId').lean();

        await Promise.all(
            registrants.map((r: any) => publishNotification({
                subtype: 'event.cancelled',
                eventId,
                userId: r.userId.toString(),
                title: event.title,
                reason,
                note,
            }))
        );

        await recordAudit({
            actorId: userId,
            action: 'event_cancel',
            resourceId: eventId,
            metadata: { reason, registrantsNotified: registrants.length },
        });

        res.json({ data: { ok: true, registrantsNotified: registrants.length } });
    } catch (err) {
        console.error('postCancelEvent error:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
}

export async function postRescheduleEvent(req: Request, res: Response) {
    try {
        const userId = (req as any).user?.id;
        const eventId = req.params.id;
        const event = (req as any).event;
        if (!event) return res.status(404).json({ message: 'Event not found' });
        if (event.status === 'cancelled') {
            return res.status(409).json({ message: 'Cannot reschedule a cancelled event' });
        }

        const { newStartsAt, newEndsAt, reason } = req.body;
        const newStart = new Date(newStartsAt);
        if (isNaN(newStart.getTime())) {
            return res.status(400).json({ message: 'Invalid newStartsAt' });
        }
        if (newStart.getTime() < Date.now() + 15 * 60_000) {
            return res.status(400).json({ message: 'newStartsAt must be at least 15 min in the future' });
        }

        await Event.findByIdAndUpdate(eventId, {
            startsAt: newStart,
            endsAt: newEndsAt ? new Date(newEndsAt) : undefined,
            rescheduledFromAt: new Date(event.startsAt ?? Date.now()),
            rescheduleNoticeAt: new Date(),
        });

        await recordAudit({
            actorId: userId,
            action: 'event_reschedule',
            resourceId: eventId,
            metadata: { newStartsAt, reason },
        });

        // Fire-and-forget fanout batching (Task 20)
        fanoutReschedule({
            eventId,
            oldStartsAt: new Date(event.startsAt ?? Date.now()).toISOString(),
            newStartsAt: newStart.toISOString(),
            title: event.title,
            reason,
        }).catch((err) => console.error('reschedule fanout failed:', err));

        res.json({ data: { ok: true, fanoutScheduled: true } });
    } catch (err) {
        console.error('postRescheduleEvent error:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
}
