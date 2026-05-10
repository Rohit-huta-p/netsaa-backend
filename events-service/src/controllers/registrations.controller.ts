import { Request, Response } from 'express';
import Event from '../models/Event';
import EventRegistration from '../models/EventRegistration';
import User from '../models/User';
import { reserveSpot, releaseSpot } from '../services/capacity.service';
import { publishNotification } from '../services/notificationPublisher.service';

export async function postRegister(req: Request, res: Response) {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const eventId = req.params.id;
    const { visibility = 'private' } = req.body;

    try {
        const event = await Event.findById(eventId).select('organizerId status startsAt');
        if (!event) return res.status(404).json({ message: 'Event not found' });
        if ((event as any).organizerId.toString() === userId) {
            return res.status(403).json({ message: 'You created this event' });
        }
        if ((event as any).status !== 'live') {
            return res.status(410).json({ message: 'Event is not accepting registrations' });
        }
        if ((event as any).startsAt < new Date()) {
            return res.status(410).json({ message: 'Event already started' });
        }

        const result = await reserveSpot(eventId);
        if (!result.ok) {
            return res.status(409).json({ message: 'Event is full or inactive' });
        }

        const userDoc = await User.findById(userId).select('name phone city');
        const contactSnapshot = userDoc ? {
            name: (userDoc as any).name,
            phone: (userDoc as any).phone,
            city: (userDoc as any).city,
        } : undefined;

        try {
            await EventRegistration.create({
                eventId,
                userId,
                status: 'confirmed',
                source: 'rsvp',
                visibility: visibility === 'public' ? 'public' : 'private',
                contactSnapshot,
                registeredAt: new Date(),
            });
        } catch (e: any) {
            if (e.code === 11000) {
                await releaseSpot(eventId);
                return res.status(409).json({ message: 'Already registered for this event' });
            }
            await releaseSpot(eventId);
            throw e;
        }

        const priorCount = await EventRegistration.countDocuments({ eventId, status: 'confirmed' });
        if (priorCount === 1) {
            await publishNotification({
                subtype: 'event.first_registration_ever',
                eventId,
                organizerId: (event as any).organizerId.toString(),
                registrantName: contactSnapshot?.name,
            });
        } else {
            await publishNotification({
                subtype: 'event.new_registration',
                eventId,
                organizerId: (event as any).organizerId.toString(),
                registrantName: contactSnapshot?.name,
            });
        }

        res.status(200).json({ data: { ok: true, visibility } });
    } catch (err) {
        console.error('postRegister error:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
}

export async function deleteMyRegistration(req: Request, res: Response) {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const eventId = req.params.id;

    const updated = await EventRegistration.findOneAndUpdate(
        { eventId, userId, status: 'confirmed' },
        { status: 'cancelled', cancelledAt: new Date() },
        { new: true }
    );

    if (!updated) {
        return res.status(404).json({ message: 'No active registration found' });
    }

    await releaseSpot(eventId);
    res.json({ data: { ok: true } });
}
