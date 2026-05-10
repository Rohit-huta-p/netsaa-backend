import { Request, Response, NextFunction } from 'express';
import Event from '../models/Event';

/**
 * IDOR guard. Ensures the authenticated user is the event organizer.
 * Apply on roster, cancel, reschedule, CSV export endpoints.
 */
export async function requireOrganizer(req: Request, res: Response, next: NextFunction) {
    try {
        const userId = (req as any).user?.id;
        const eventId = req.params.eventId || req.params.id;
        if (!userId || !eventId) return res.status(401).json({ message: 'Unauthorized' });

        const event = await Event.findById(eventId).select('organizerId').lean();
        if (!event) return res.status(404).json({ message: 'Event not found' });
        if ((event as any).organizerId.toString() !== userId) {
            return res.status(403).json({ message: 'Forbidden — only the organizer can perform this action' });
        }

        (req as any).event = event;
        next();
    } catch (err) {
        next(err);
    }
}
