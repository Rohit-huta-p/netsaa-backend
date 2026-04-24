/**
 * Supertest regression coverage for GET /v1/organizers/me/gigs after the
 * IDOR fix in gigController.getOrganizerGigs.
 *
 * Three cases:
 *   1. Caller's own gigs only — attacker-style ?organizerId must be ignored
 *   2. ?status filter honored
 *   3. ?limit caps the response
 *
 * seedGig is inlined (duplicated from organizerApplicants.test.ts) per the
 * plan's "don't DRY across test files" guidance — keeps each file
 * self-contained and readable out of order.
 */

import request from 'supertest';
import mongoose from 'mongoose';
import app from '../app';
import Gig from '../models/Gig';
import { authTokenFor } from './setup';

async function seedGig(organizerId: string, overrides: Partial<any> = {}) {
    // Same helper body as organizerApplicants.test.ts — keep inline (the
    // engineer may be reading tasks out of order, and this file is testing a
    // different behavior so DRY shouldn't span files).
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

describe('GET /v1/organizers/me/gigs — IDOR + filter regressions', () => {
    let hirerId: string;
    let otherHirerId: string;
    let token: string;

    beforeEach(async () => {
        hirerId = new mongoose.Types.ObjectId().toString();
        otherHirerId = new mongoose.Types.ObjectId().toString();
        token = authTokenFor(hirerId);
    });

    it("200: only returns the caller's own gigs (ignores ?organizerId)", async () => {
        await seedGig(hirerId, { title: 'Mine' });
        await seedGig(otherHirerId, { title: 'Theirs' });
        // Attacker-style: pass the other user's id in query — must be ignored.
        const res = await request(app)
            .get(`/v1/organizers/me/gigs?organizerId=${otherHirerId}`)
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
        expect(res.body.data.gigs).toHaveLength(1);
        expect(res.body.data.gigs[0].title).toBe('Mine');
    });

    it('200: status filter returns only matching status', async () => {
        await seedGig(hirerId, { title: 'Draft one', status: 'draft' });
        await seedGig(hirerId, { title: 'Live one', status: 'published' });
        const res = await request(app)
            .get('/v1/organizers/me/gigs?status=draft')
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
        expect(res.body.data.gigs).toHaveLength(1);
        expect(res.body.data.gigs[0].title).toBe('Draft one');
    });

    it('200: limit caps returned gigs', async () => {
        for (let i = 0; i < 3; i++) {
            await seedGig(hirerId, { title: `Gig ${i}` });
        }
        const res = await request(app)
            .get('/v1/organizers/me/gigs?limit=2')
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
        expect(res.body.data.gigs).toHaveLength(2);
    });
});
