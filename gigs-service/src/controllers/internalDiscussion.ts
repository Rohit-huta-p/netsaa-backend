import { Request, Response } from 'express';
import Gig from '../models/Gig';

/**
 * GET /internal/discussion/gig/:gigId?userId=...
 *
 * Returns { canJoin: boolean }.
 * Rules:
 *   - draft gigs: no (unpublished content)
 *   - all other statuses (published/paused/closed/expired): yes
 */
export async function checkGigDiscussionAccess(req: Request, res: Response): Promise<void> {
    try {
        const { gigId } = req.params;
        const gig = await Gig.findById(gigId).select('status').lean();
        if (!gig) {
            res.json({ canJoin: false });
            return;
        }
        res.json({ canJoin: gig.status !== 'draft' });
    } catch (err: any) {
        console.error('[internalDiscussion] checkGigDiscussionAccess failed:', err?.message);
        res.status(500).json({ canJoin: false });
    }
}
