import { Request, Response } from 'express';
import ical, { ICalCalendarMethod } from 'ical-generator';
import Event from '../models/Event';
import EventRegistration from '../models/EventRegistration';
import { decryptLink } from '../services/encryptedLink.service';

export async function getCalendarIcs(req: Request, res: Response) {
    try {
        const userId = (req as any).user?.id;
        if (!userId) return res.status(401).json({ message: 'Unauthorized' });

        const eventId = req.params.id;
        const event = await Event.findById(eventId).lean();
        if (!event) return res.status(404).json({ message: 'Event not found' });

        const orgIdStr = ((event as any).organizerId?._id ?? (event as any).organizerId).toString();
        const isOrganizer = orgIdStr === userId;

        let registration: any = null;
        if (!isOrganizer) {
            registration = await EventRegistration.findOne({
                eventId,
                userId,
                status: { $in: ['confirmed', 'attended'] },
            }).lean();
            if (!registration) {
                return res.status(403).json({ message: 'Calendar export requires registration or organizer access' });
            }
        }

        // Decrypt online link if applicable + caller has it
        let onlineUrl: string | undefined;
        const loc = (event as any).location;
        if (loc?.kind === 'online' && loc.onlineLinkEnc) {
            const salt = registration?.linkAccessKey ?? loc.onlineLinkSalt;
            if (salt) {
                try {
                    onlineUrl = decryptLink(loc.onlineLinkEnc, salt);
                } catch (err) {
                    console.warn('Failed to decrypt online link for cal export:', err);
                }
            }
        }

        const cal = ical({
            name: 'NETSA Events',
            prodId: { company: 'NETSA', product: 'netsa-events', language: 'EN' },
            method: ICalCalendarMethod.REQUEST,
        });

        cal.createEvent({
            id: `netsa-event-${eventId}`,
            start: (event as any).startsAt,
            end: (event as any).endsAt ?? new Date(new Date((event as any).startsAt).getTime() + 2 * 3600_000),
            summary: (event as any).title,
            description: (event as any).about?.slice(0, 500),
            location: loc?.kind === 'online'
                ? (loc.onlinePlatform || 'Online') + (onlineUrl ? `\n${onlineUrl}` : '')
                : [loc?.venueName, loc?.address].filter(Boolean).join(', '),
            url: onlineUrl,
        });

        res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="netsa-event-${eventId}.ics"`);
        res.send(cal.toString());
    } catch (err) {
        console.error('getCalendarIcs error:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
}
