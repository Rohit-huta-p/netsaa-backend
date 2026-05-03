// netsa-backend/gigs-service/src/tests/markApplicationViewed.test.ts
//
// Plan 5 — POST /v1/applications/:applicationId/view
// Auth: organizer-only (gig owner). Fires gig.application.viewed event
// with day-bucket idempotency in the emitter so a hirer scrolling back
// to the same card multiple times in one day produces at most one
// downstream notification.

import request from 'supertest';
import mongoose from 'mongoose';
import app from '../app';
import Gig from '../models/Gig';
import GigApplication from '../models/GigApplication';
import { authTokenFor } from './setup';
import { makeGigPayload } from './fixtures/gigFactory';

describe('POST /v1/applications/:applicationId/view', () => {
    let organizerId: string;
    let artistId: string;
    let otherUserId: string;
    let gigId: string;
    let applicationId: string;

    beforeEach(async () => {
        organizerId = new mongoose.Types.ObjectId().toString();
        artistId = new mongoose.Types.ObjectId().toString();
        otherUserId = new mongoose.Types.ObjectId().toString();

        // Seed a published gig owned by the organizer.
        const gig = await Gig.create({
            ...makeGigPayload(),
            organizerId,
            organizerSnapshot: {
                displayName: 'Org',
                organizationName: 'Org Co',
                profileImageUrl: '',
                rating: 0,
                gigsHosted: 0,
            },
            status: 'published',
            schedule: {
                startDate: new Date(Date.now() + 7 * 86400000),
                endDate: new Date(Date.now() + 7 * 86400000 + 3600000),
            },
        } as any);
        gigId = gig._id.toString();

        // Seed an application from the artist.
        const application = await GigApplication.create({
            gigId: gig._id,
            artistId,
            artistSnapshot: {
                displayName: 'Artist',
                artistType: 'Dancer',
                profileImageUrl: '',
                rating: 0,
            },
            status: 'applied',
        } as any);
        applicationId = application._id.toString();
    });

    it('200: organizer (gig owner) records a view', async () => {
        const token = authTokenFor(organizerId, 'organizer');
        const res = await request(app)
            .post(`/v1/applications/${applicationId}/view`)
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(res.body.data?.recorded ?? res.body.recorded).toBe(true);
    });

    it('403: non-owner cannot record a view', async () => {
        const token = authTokenFor(otherUserId, 'artist');
        const res = await request(app)
            .post(`/v1/applications/${applicationId}/view`)
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(403);
    });

    it('401: unauthenticated request rejected', async () => {
        const res = await request(app).post(
            `/v1/applications/${applicationId}/view`
        );
        expect(res.status).toBe(401);
    });

    it('404: missing application returns 404', async () => {
        const token = authTokenFor(organizerId, 'organizer');
        const ghostId = new mongoose.Types.ObjectId().toString();
        const res = await request(app)
            .post(`/v1/applications/${ghostId}/view`)
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(404);
    });

    it('400: malformed application id rejected', async () => {
        const token = authTokenFor(organizerId, 'organizer');
        const res = await request(app)
            .post('/v1/applications/not-an-id/view')
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(400);
    });

    it('200 with skipped:self when hirer is also the applicant (edge case)', async () => {
        // Edge case: organizer == artist. Endpoint should no-op without
        // emitting (we only want to ping artists about OTHER people viewing).
        const selfApp = await GigApplication.create({
            gigId,
            artistId: organizerId,
            artistSnapshot: {
                displayName: 'Self',
                artistType: 'Dancer',
                profileImageUrl: '',
                rating: 0,
            },
            status: 'applied',
        } as any);

        const token = authTokenFor(organizerId, 'organizer');
        const res = await request(app)
            .post(`/v1/applications/${selfApp._id}/view`)
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(res.body.data?.skipped ?? res.body.skipped).toBe('self');
    });
});
