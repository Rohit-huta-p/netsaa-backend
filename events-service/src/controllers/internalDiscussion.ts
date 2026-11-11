import { Request, Response } from 'express';
import Event from '../models/Event';
import EventRegistration from '../models/EventRegistration';

/**
 * GET /internal/discussion/event/:eventId?userId=...
 *
 * Returns { canJoin: boolean }.
 * Rules:
 *   - draft events: no (not published yet)
 *   - private visibility OR discussionVisibility=attendees_only: only registered attendees
 *   - everything else (public/unlisted, live/cancelled/completed): yes
 */
export async function checkEventDiscussionAccess(req: Request, res: Response): Promise<void> {
    try {
        const { eventId } = req.params;
        const { userId } = req.query;

        const event = await Event.findById(eventId)
            .select('status visibility discussionVisibility')
            .lean();

        if (!event) {
            res.json({ canJoin: false });
            return;
        }

        if (event.status === 'draft') {
            res.json({ canJoin: false });
            return;
        }

        // Private event or attendees-only discussion board requires registration
        if (event.visibility === 'private' || event.discussionVisibility === 'attendees_only') {
            if (!userId) {
                res.json({ canJoin: false });
                return;
            }
            const reg = await EventRegistration.findOne({
                eventId,
                userId,
                status: { $in: ['registered', 'attended', 'approved'] },
            }).select('_id').lean();
            res.json({ canJoin: !!reg });
            return;
        }

        res.json({ canJoin: true });
    } catch (err: any) {
        console.error('[internalDiscussion] checkEventDiscussionAccess failed:', err?.message);
        res.status(500).json({ canJoin: false });
    }
}
