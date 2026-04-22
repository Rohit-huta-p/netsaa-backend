/**
 * Supertest coverage for PATCH /v1/applications/:id/withdraw.
 *
 * Four status paths:
 *   200 — happy path: own pending application -> status=withdrawn
 *   403 — another user's application
 *   409 — already-hired application (non-withdrawable status)
 *   404 — unknown (but valid) ObjectId
 */

import request from 'supertest';
import mongoose from 'mongoose';
import app from '../app';
import GigApplication from '../models/GigApplication';
import { authTokenFor } from './setup';

/** Convenience: seed one GigApplication with overridable defaults. */
const seedApplication = async (overrides: Partial<Record<string, any>> = {}) => {
    const artistId = overrides.artistId ?? new mongoose.Types.ObjectId();
    const gigId = overrides.gigId ?? new mongoose.Types.ObjectId();
    return GigApplication.create({
        gigId,
        artistId,
        artistSnapshot: {
            displayName: 'Test Artist',
            artistType: 'Dancer',
            profileImageUrl: '',
            rating: 0,
        },
        coverNote: 'hi',
        portfolioLinks: [],
        status: 'applied',
        ...overrides,
    });
};

describe('PATCH /v1/applications/:id/withdraw', () => {
    it('200: withdraws own pending application', async () => {
        const artistId = new mongoose.Types.ObjectId();
        const app1 = await seedApplication({ artistId, status: 'applied' });
        const token = authTokenFor(artistId.toString(), 'artist');

        const res = await request(app)
            .patch(`/v1/applications/${app1._id}/withdraw`)
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(res.body.data.status).toBe('withdrawn');
        expect(res.body.data.withdrawnAt).toBeDefined();

        // DB state
        const fresh = await GigApplication.findById(app1._id).lean();
        expect(fresh?.status).toBe('withdrawn');
        expect(fresh?.withdrawnAt).toBeInstanceOf(Date);
    });

    it("403: cannot withdraw another user's application", async () => {
        const ownerId = new mongoose.Types.ObjectId();
        const intruderId = new mongoose.Types.ObjectId();
        const app1 = await seedApplication({ artistId: ownerId, status: 'applied' });
        const intruderToken = authTokenFor(intruderId.toString(), 'artist');

        const res = await request(app)
            .patch(`/v1/applications/${app1._id}/withdraw`)
            .set('Authorization', `Bearer ${intruderToken}`);

        expect(res.status).toBe(403);

        // DB state unchanged
        const fresh = await GigApplication.findById(app1._id).lean();
        expect(fresh?.status).toBe('applied');
        expect(fresh?.withdrawnAt).toBeUndefined();
    });

    it('409: cannot withdraw a hired application', async () => {
        const artistId = new mongoose.Types.ObjectId();
        const app1 = await seedApplication({ artistId, status: 'hired' });
        const token = authTokenFor(artistId.toString(), 'artist');

        const res = await request(app)
            .patch(`/v1/applications/${app1._id}/withdraw`)
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(409);
        expect(res.body.meta.message).toMatch(/hired/);

        // DB state unchanged
        const fresh = await GigApplication.findById(app1._id).lean();
        expect(fresh?.status).toBe('hired');
        expect(fresh?.withdrawnAt).toBeUndefined();
    });

    it('404: returns not-found for unknown id', async () => {
        const artistId = new mongoose.Types.ObjectId();
        const token = authTokenFor(artistId.toString(), 'artist');
        const randomId = new mongoose.Types.ObjectId().toString();

        const res = await request(app)
            .patch(`/v1/applications/${randomId}/withdraw`)
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(404);
    });
});

describe('GET /v1/users/me/gig-applications ?limit', () => {
    it('returns exactly N applications when limit=N and more exist', async () => {
        const artistId = new mongoose.Types.ObjectId();
        const token = authTokenFor(artistId.toString(), 'artist');

        // Seed 3 applications for the same artist across distinct gigs.
        for (let i = 0; i < 3; i++) {
            await seedApplication({ artistId, status: 'applied' });
        }

        const res = await request(app)
            .get('/v1/users/me/gig-applications?limit=2')
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body.data)).toBe(true);
        expect(res.body.data).toHaveLength(2);
    });
});
