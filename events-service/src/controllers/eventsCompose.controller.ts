import { Request, Response } from 'express';
import Event from '../models/Event';
import { checkEventContent } from '../utils/autoFlag';
import { incrementTagUsage } from '../services/tagGovernance.service';
import { publishNotification } from '../services/notificationPublisher.service';

const MIN_PRIOR_EVENTS_TO_AUTO_PUBLISH = 3;
const MIN_HOURS_AHEAD = 0.25;          // 15 min
const MAX_DAYS_AHEAD = 180;            // 6 months

export async function postCreateEvent(req: Request, res: Response) {
    try {
        const userId = (req as any).user?.id;
        if (!userId) return res.status(401).json({ message: 'Unauthorized' });

        const body = req.body;

        // Field validation
        if (!Array.isArray(body.topicTags) || body.topicTags.length < 1 || body.topicTags.length > 3) {
            return res.status(400).json({ message: 'topicTags must contain 1-3 entries' });
        }
        if (!body.title || body.title.length < 6 || body.title.length > 80) {
            return res.status(400).json({ message: 'title must be 6-80 chars' });
        }
        if (!body.about || body.about.length < 100 || body.about.length > 2000) {
            return res.status(400).json({ message: 'about must be 100-2000 chars' });
        }
        if (!Array.isArray(body.media) || body.media.length < 1) {
            return res.status(400).json({ message: 'media must contain at least 1 item' });
        }

        const startsAt = new Date(body.startsAt);
        const now = Date.now();
        if (startsAt.getTime() < now + MIN_HOURS_AHEAD * 3600_000) {
            return res.status(400).json({ message: 'startsAt must be at least 15 min in the future (no past dates)' });
        }
        if (startsAt.getTime() > now + MAX_DAYS_AHEAD * 86400_000) {
            return res.status(400).json({ message: `startsAt must be within ${MAX_DAYS_AHEAD} days` });
        }

        if (body.capacity?.total > 1000) {
            return res.status(400).json({ message: 'capacity > 1000 requires admin approval' });
        }

        // Auto-flag check
        const flagResult = checkEventContent({
            title: body.title,
            tagline: body.tagline,
            about: body.about,
            whatToExpect: body.whatToExpect,
        });

        // Decide initial status
        let status: 'live' | 'pending_review' = 'live';
        let moderationFlagReason: string | undefined;
        let moderationQueueAt: Date | undefined;

        if (flagResult.flagged) {
            status = 'pending_review';
            moderationFlagReason = flagResult.reasons[0];
            moderationQueueAt = new Date();
        } else {
            const priorCount = await Event.countDocuments({ organizerId: userId });
            if (priorCount < MIN_PRIOR_EVENTS_TO_AUTO_PUBLISH) {
                status = 'pending_review';
                moderationQueueAt = new Date();
            }
        }

        const event = await Event.create({
            organizerId: userId,
            title: body.title,
            tagline: body.tagline,
            topicTags: body.topicTags,
            registrationMode: body.registrationMode || 'free_rsvp',
            about: body.about,
            whatToExpect: body.whatToExpect,
            skills: body.skills || [],
            startsAt,
            endsAt: body.endsAt ? new Date(body.endsAt) : undefined,
            durationKind: body.durationKind,
            location: body.location,
            capacity: { total: body.capacity.total, registeredCount: 0 },
            media: body.media,
            status,
            moderationFlagReason,
            moderationQueueAt,
            publishedAt: status === 'live' ? new Date() : undefined,
        });

        if (status === 'live') {
            await incrementTagUsage(body.topicTags);
            await publishNotification({
                subtype: 'event.new_from_followed_organizer',
                eventId: (event as any)._id.toString(),
                organizerId: userId,
                title: body.title,
            });
        }

        res.status(200).json({
            data: {
                event: {
                    _id: (event as any)._id,
                    status,
                    moderationFlagReason,
                },
            },
        });
    } catch (err: any) {
        console.error('postCreateEvent error:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
}
