/**
 * Supertest coverage for GET /v1/organizers/me/applicants (hirer dashboard
 * applicants inbox).
 *
 * Eight cases, mirroring the handler's branches:
 *   1. Empty state when caller has no posted gigs
 *   2. Cross-user scoping: only the caller's gigs' applicants are returned
 *   3. ?status filter honored
 *   4. ?limit cap honored
 *   5. 401 when unauthenticated
 *   6. ?gigId narrows to a single owned gig
 *   7. ?gigId with malformed ObjectId is silently ignored
 *   8. ?gigId pointing at another user's gig returns [] (scoping guard —
 *      this is the security regression)
 */

import request from 'supertest';
import mongoose from 'mongoose';
import app from '../app';
import Gig from '../models/Gig';
import GigApplication from '../models/GigApplication';
import { authTokenFor } from './setup';

// Seed a Gig with sane defaults matching the schema. Overrides let individual
// tests tweak title/status without repeating the full object.
async function seedGig(organizerId: string, overrides: Partial<any> = {}) {
    return Gig.create({
        title: overrides.title ?? 'Test gig',
        description: 'desc',
        type: 'one-time',
        category: 'music',
        tags: [],
        organizerId,
        organizerSnapshot: { displayName: '', organizationName: '', profileImageUrl: '', rating: 0 },
        artistTypes: [],
        requiredSkills: [],
        experienceLevel: 'intermediate',
        ageRange: { min: 18, max: 99 },
        genderPreference: 'any',
        location: { city: 'Pune', state: 'MH', country: 'IN', venueName: '', address: '', isRemote: false },
        schedule: { startDate: new Date(), endDate: new Date(), durationLabel: '', timeCommitment: '' },
        compensation: { model: 'fixed', amount: 10000, currency: 'INR', negotiable: false, perks: [] },
        applicationDeadline: new Date(Date.now() + 7 * 24 * 3600 * 1000),
        status: 'published',
        ...overrides,
    });
}

// Seed one GigApplication for (gigId, artistId) with a given status.
async function seedApplicant(
    gigId: mongoose.Types.ObjectId,
    artistId: string,
    status = 'applied'
) {
    return GigApplication.create({
        gigId,
        artistId,
        artistSnapshot: { displayName: 'Artist', artistType: 'dancer', profileImageUrl: '', rating: 0 },
        status,
        appliedAt: new Date(),
    });
}

describe('GET /v1/organizers/me/applicants', () => {
    let hirerId: string;
    let otherHirerId: string;
    let artistId: string;
    let token: string;

    beforeEach(async () => {
        hirerId = new mongoose.Types.ObjectId().toString();
        otherHirerId = new mongoose.Types.ObjectId().toString();
        artistId = new mongoose.Types.ObjectId().toString();
        token = authTokenFor(hirerId);
    });

    it('200: returns [] when the caller has no posted gigs', async () => {
        const res = await request(app)
            .get('/v1/organizers/me/applicants')
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
        expect(res.body.data.applicants).toEqual([]);
        expect(res.body.data.total).toBe(0);
    });

    it("200: returns applicants only for the caller's gigs (scoping)", async () => {
        const myGig = await seedGig(hirerId);
        const theirGig = await seedGig(otherHirerId);
        await seedApplicant(myGig._id as mongoose.Types.ObjectId, artistId, 'applied');
        await seedApplicant(theirGig._id as mongoose.Types.ObjectId, artistId, 'applied');
        const res = await request(app)
            .get('/v1/organizers/me/applicants')
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
        expect(res.body.data.applicants).toHaveLength(1);
        expect(res.body.data.applicants[0].gigId).toBe(String(myGig._id));
    });

    it('200: status filter honored', async () => {
        const myGig = await seedGig(hirerId);
        await seedApplicant(myGig._id as mongoose.Types.ObjectId, artistId, 'applied');
        await seedApplicant(
            myGig._id as mongoose.Types.ObjectId,
            new mongoose.Types.ObjectId().toString(),
            'hired'
        );
        const res = await request(app)
            .get('/v1/organizers/me/applicants?status=hired')
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
        expect(res.body.data.applicants).toHaveLength(1);
        expect(res.body.data.applicants[0].status).toBe('hired');
    });

    it('200: limit honored', async () => {
        const myGig = await seedGig(hirerId);
        for (let i = 0; i < 5; i++) {
            await seedApplicant(
                myGig._id as mongoose.Types.ObjectId,
                new mongoose.Types.ObjectId().toString(),
                'applied'
            );
        }
        const res = await request(app)
            .get('/v1/organizers/me/applicants?limit=2')
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
        expect(res.body.data.applicants).toHaveLength(2);
    });

    it('401: unauthenticated request rejected', async () => {
        const res = await request(app).get('/v1/organizers/me/applicants');
        expect(res.status).toBe(401);
    });

    it('200: ?gigId narrows to a single gig when caller owns it', async () => {
        const gigA = await seedGig(hirerId, { title: 'A' });
        const gigB = await seedGig(hirerId, { title: 'B' });
        await seedApplicant(gigA._id as mongoose.Types.ObjectId, artistId, 'applied');
        await seedApplicant(gigB._id as mongoose.Types.ObjectId, artistId, 'applied');
        const res = await request(app)
            .get(`/v1/organizers/me/applicants?gigId=${gigA._id}`)
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
        expect(res.body.data.applicants).toHaveLength(1);
        expect(String(res.body.data.applicants[0].gigId)).toBe(String(gigA._id));
    });

    it('200: ?gigId with a malformed ObjectId is silently ignored (returns all owned)', async () => {
        const myGig = await seedGig(hirerId);
        await seedApplicant(myGig._id as mongoose.Types.ObjectId, artistId, 'applied');
        const res = await request(app)
            .get('/v1/organizers/me/applicants?gigId=not-an-objectid')
            .set('Authorization', `Bearer ${token}`);
        // Malformed id is discarded by the handler's regex validator; the
        // endpoint returns the full unscoped list instead of erroring.
        expect(res.status).toBe(200);
        expect(res.body.data.applicants).toHaveLength(1);
    });

    it("200: ?gigId pointing at another user's gig returns [] (scoping guard)", async () => {
        const theirGig = await seedGig(otherHirerId);
        await seedApplicant(theirGig._id as mongoose.Types.ObjectId, artistId, 'applied');
        const res = await request(app)
            .get(`/v1/organizers/me/applicants?gigId=${theirGig._id}`)
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
        expect(res.body.data.applicants).toEqual([]);
    });
});
