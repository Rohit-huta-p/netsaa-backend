import { Request, Response } from 'express';
import Event from '../models/Event';
import { checkEventContent } from '../utils/autoFlag';
import { incrementTagUsage } from '../services/tagGovernance.service';
import { publishNotification } from '../services/notificationPublisher.service';
import { emit } from '../utils/observability';

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

        if (flagResult.flagged) {
            emit('auto_flag_triggered', 'info', {
                reason: flagResult.reasons[0],
                eventId: (event as any)._id.toString(),
            });
        }

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

export async function getEventDetail(req: Request, res: Response) {
    try {
        const { id } = req.params;
        const event = await Event.findById(id)
            .populate('organizerId', 'name verified avatar role')
            .lean();

        if (!event) return res.status(404).json({ message: 'Event not found' });
        if ((event as any).status === 'cancelled') {
            return res.status(410).json({ message: 'Event has been cancelled', data: { event: stripSecrets(event) } });
        }
        if ((event as any).status === 'pending_review') {
            const userId = (req as any).user?.id;
            if (!userId || (event as any).organizerId._id.toString() !== userId) {
                return res.status(404).json({ message: 'Event not found' });
            }
        }

        Event.findByIdAndUpdate(id, { $inc: { 'stats.views': 1 } }).catch(() => { });

        const slotsLeft = (event as any).capacity.total - (event as any).capacity.registeredCount;

        res.json({
            data: {
                event: {
                    ...stripSecrets(event),
                    capacity: { ...(event as any).capacity, slotsLeft },
                },
            },
        });
    } catch (err) {
        console.error('getEventDetail error:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
}

export async function getEventsList(req: Request, res: Response) {
    try {
        const { topicTag, city, mode, skill, q, page = '1', limit = '20' } = req.query as Record<string, string>;

        const query: any = { status: 'live' };
        if (topicTag) query.topicTags = topicTag;
        if (mode) query.registrationMode = mode;
        if (skill) query.skills = skill;
        if (city) query['location.address'] = { $regex: city, $options: 'i' };
        if (q) query.$text = { $search: q };

        const lim = Math.min(parseInt(limit, 10) || 20, 100);
        const skip = ((parseInt(page, 10) || 1) - 1) * lim;

        const [events, total] = await Promise.all([
            Event.find(query)
                .sort({ startsAt: 1 })
                .limit(lim)
                .skip(skip)
                .populate('organizerId', 'name verified avatar')
                .lean(),
            Event.countDocuments(query),
        ]);

        res.json({
            data: {
                events: events.map(stripSecrets),
                total,
                page: parseInt(page, 10),
                limit: lim,
            },
        });
    } catch (err) {
        console.error('getEventsList error:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
}

/**
 * Strip sensitive server-only fields before sending to client.
 * Encrypted online link + salt never leave the backend in the public detail call.
 */
function stripSecrets(event: any): any {
    const cleaned = { ...event };
    if (cleaned.location) {
        const loc = { ...cleaned.location };
        delete loc.onlineLinkEnc;
        delete loc.onlineLinkSalt;
        cleaned.location = loc;
    }
    return cleaned;
}
