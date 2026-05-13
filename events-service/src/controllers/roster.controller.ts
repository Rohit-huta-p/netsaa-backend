import { Request, Response } from 'express';
import EventRegistration from '../models/EventRegistration';

interface RosterRow {
    _id: any;
    userId: any;
    status: string;
    visibility: 'public' | 'private';
    contactSnapshot?: { name?: string; city?: string };
    registeredAt: Date;
}

/**
 * Sanitize a roster row: strip phone unless caller is in a hire-confirm context.
 * Per DPDP, phone is shared only at hire time, never in roster listing.
 */
function sanitizeRow(row: any): RosterRow {
    const snap = row.contactSnapshot ? {
        name: row.contactSnapshot.name,
        city: row.contactSnapshot.city,
    } : undefined;
    return {
        _id: row._id,
        userId: row.userId,
        status: row.status,
        visibility: row.visibility,
        contactSnapshot: snap,
        registeredAt: row.registeredAt,
    };
}

export async function getRoster(req: Request, res: Response) {
    try {
        const eventId = req.params.id;
        const event = (req as any).event;
        if (!event) return res.status(404).json({ message: 'Event not found' });

        const page = Math.max(1, parseInt((req.query.page as string) || '1', 10));
        const limit = Math.min(100, parseInt((req.query.limit as string) || '50', 10));
        const skip = (page - 1) * limit;

        const [rows, total] = await Promise.all([
            EventRegistration.find({ eventId, status: { $in: ['confirmed', 'attended'] } })
                .sort({ registeredAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            EventRegistration.countDocuments({ eventId, status: { $in: ['confirmed', 'attended'] } }),
        ]);

        res.json({
            data: {
                rows: rows.map(sanitizeRow),
                total,
                page,
                limit,
            },
        });
    } catch (err) {
        console.error('getRoster error:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
}

export async function getMyRegistration(req: Request, res: Response) {
    try {
        const userId = (req as any).user?.id;
        if (!userId) return res.status(401).json({ message: 'Unauthorized' });

        const reg = await EventRegistration.findOne({
            eventId: req.params.id,
            userId,
            status: { $in: ['confirmed', 'attended'] },
        }).lean();

        if (!reg) return res.status(404).json({ message: 'No active registration' });

        res.json({ data: reg });
    } catch (err) {
        console.error('getMyRegistration error:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
}
