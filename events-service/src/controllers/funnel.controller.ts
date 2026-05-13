import { Request, Response } from 'express';
import axios from 'axios';
import EventRegistration from '../models/EventRegistration';

const GIGS_BASE = process.env.GIGS_SERVICE_URL || 'http://localhost:5001';

/**
 * GET /api/events/:id/funnel-metrics
 * Organizer-only. Returns conversion stats showing how many event registrants
 * went on to apply to gigs (tagged with source=event:<eventId>).
 *
 * Cross-service: calls gigs-service /internal/gig-applications/count.
 * If gigs-service is unavailable the call is swallowed and gigApplicationsFromEvent
 * is returned as 0 (graceful degradation — do not fail the whole metric).
 */
export async function getFunnelMetrics(req: Request, res: Response) {
    try {
        const eventId = req.params.id;

        // Cross-service: query gigs-service for application count with source=event:<eventId>
        let gigApplicationsFromEvent = 0;
        try {
            const r = await axios.get(`${GIGS_BASE}/internal/gig-applications/count`, {
                params: { source: `event:${eventId}` },
                timeout: 3000,
            });
            gigApplicationsFromEvent = r.data?.data?.count ?? 0;
        } catch (err) {
            console.warn('funnel: gigs-service query failed', (err as any).message);
        }

        const totalRegistrations = await EventRegistration.countDocuments({
            eventId,
            status: { $in: ['confirmed', 'attended'] },
        });

        const conversionRate = totalRegistrations > 0
            ? gigApplicationsFromEvent / totalRegistrations
            : 0;

        res.json({
            data: {
                eventId,
                totalRegistrations,
                gigApplicationsFromEvent,
                conversionRate,
            },
        });
    } catch (err) {
        console.error('getFunnelMetrics error:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
}
