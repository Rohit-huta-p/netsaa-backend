// netsa-backend/gigs-service/src/tests/gigDetailRedesign.test.ts
//
// Plan 5 — Gig detail page redesign coverage:
//   1. organizerSnapshot.gigsHosted populated at create time from this
//      organizer's existing non-draft gig count.
//   2. organizerSnapshot.gigsHosted refreshed on getGigById read.
//   3. organizerSnapshot.avgReplyMinutes accepted via schema (round-trip).
//   4. location.geo (lat/lng) round-trips when set directly.
//   5. Pre-save hook NO-OPs in test env (NODE_ENV=test, GEOCODING_LIVE
//      unset) — the live network is never hit during jest.
//   6. Mock geocoder ('mock' provider) returns deterministic Pune coords.
//
// Live geocoding (Nominatim) is intentionally NOT exercised here. To run
// it manually:
//   GEOCODING_LIVE=1 GEOCODING_PROVIDER=nominatim npx jest gigDetailRedesign

import request from 'supertest';
import mongoose from 'mongoose';
import app from '../app';
import Gig from '../models/Gig';
import { authTokenFor } from './setup';
import { makeGigPayload } from './fixtures/gigFactory';
import { geocodeAddress } from '../services/geocoding.service';

describe('Plan 5 — gig detail redesign', () => {
    let organizerId: string;
    let token: string;

    beforeEach(() => {
        organizerId = new mongoose.Types.ObjectId().toString();
        token = authTokenFor(organizerId, 'organizer');
    });

    // ─── organizerSnapshot.gigsHosted ───────────────────────────────────

    it('createGig populates organizerSnapshot.gigsHosted = 0 for first gig', async () => {
        const payload = makeGigPayload();
        const res = await request(app)
            .post('/v1/gigs')
            .set('Authorization', `Bearer ${token}`)
            .send(payload);

        expect([200, 201]).toContain(res.status);
        const gigId = res.body.data?._id ?? res.body.data?.gig?._id;
        const stored = await Gig.findById(gigId).lean();
        expect(stored?.organizerSnapshot.gigsHosted).toBe(0);
    });

    it('createGig populates gigsHosted to count this organizer\'s prior published gigs', async () => {
        // Seed 3 published gigs for this organizer
        for (let i = 0; i < 3; i++) {
            await Gig.create({
                ...makeGigPayload({ title: `Seed ${i}` }),
                organizerId,
                organizerSnapshot: {
                    displayName: 'Seed',
                    organizationName: 'Seed Co',
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
        }

        // Seed 1 draft (must NOT be counted)
        await Gig.create({
            ...makeGigPayload({ title: 'Draft' }),
            organizerId,
            organizerSnapshot: {
                displayName: 'Seed',
                organizationName: 'Seed Co',
                profileImageUrl: '',
                rating: 0,
                gigsHosted: 0,
            },
            status: 'draft',
            schedule: {
                startDate: new Date(Date.now() + 7 * 86400000),
                endDate: new Date(Date.now() + 7 * 86400000 + 3600000),
            },
        } as any);

        // Now create the 4th via the API; should report 3 prior gigs.
        const payload = makeGigPayload({ title: 'Fourth' });
        const res = await request(app)
            .post('/v1/gigs')
            .set('Authorization', `Bearer ${token}`)
            .send(payload);

        expect([200, 201]).toContain(res.status);
        const gigId = res.body.data?._id ?? res.body.data?.gig?._id;
        const stored = await Gig.findById(gigId).lean();
        expect(stored?.organizerSnapshot.gigsHosted).toBe(3);
    });

    it('getGigById refreshes gigsHosted on read (stale snapshot is fixed)', async () => {
        // Create a gig with a deliberately stale snapshot count
        const gig = await Gig.create({
            ...makeGigPayload(),
            organizerId,
            organizerSnapshot: {
                displayName: 'Org',
                organizationName: 'Org Co',
                profileImageUrl: '',
                rating: 0,
                gigsHosted: 999, // stale
            },
            status: 'published',
            schedule: {
                startDate: new Date(Date.now() + 7 * 86400000),
                endDate: new Date(Date.now() + 7 * 86400000 + 3600000),
            },
        } as any);

        // Seed an additional published gig so the live count = 2
        await Gig.create({
            ...makeGigPayload({ title: 'Sibling' }),
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

        const res = await request(app).get(`/v1/gigs/${gig._id}`);

        expect(res.status).toBe(200);
        const fresh = res.body.data?.organizerSnapshot ?? res.body.organizerSnapshot;
        expect(fresh).toBeDefined();
        expect(fresh.gigsHosted).toBe(2);
    });

    // ─── organizerSnapshot.avgReplyMinutes ──────────────────────────────

    it('avgReplyMinutes round-trips through the schema', async () => {
        const gig = await Gig.create({
            ...makeGigPayload(),
            organizerId,
            organizerSnapshot: {
                displayName: 'Org',
                organizationName: 'Org Co',
                profileImageUrl: '',
                rating: 4.7,
                gigsHosted: 5,
                avgReplyMinutes: 120,
            },
            status: 'published',
            schedule: {
                startDate: new Date(Date.now() + 7 * 86400000),
                endDate: new Date(Date.now() + 7 * 86400000 + 3600000),
            },
        } as any);

        const stored = await Gig.findById(gig._id).lean();
        expect(stored?.organizerSnapshot.avgReplyMinutes).toBe(120);
    });

    // ─── location.geo round-trip ────────────────────────────────────────

    it('location.geo {lat,lng} round-trips through the schema', async () => {
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
            location: {
                city: 'Pune',
                state: 'Maharashtra',
                country: 'India',
                venueName: 'Test venue',
                address: '123 test road',
                isRemote: false,
                geo: { lat: 18.5204, lng: 73.8567 },
            },
        } as any);

        const stored = await Gig.findById(gig._id).lean();
        expect(stored?.location?.geo?.lat).toBeCloseTo(18.5204, 4);
        expect(stored?.location?.geo?.lng).toBeCloseTo(73.8567, 4);
    });

    // ─── pre-save hook is silent in test env ────────────────────────────

    it('pre-save geocoding hook does NOT call live network in test env', async () => {
        // The service short-circuits when NODE_ENV=test and GEOCODING_LIVE
        // is unset, so a freshly created gig should have no geo populated.
        const payload = makeGigPayload();
        const res = await request(app)
            .post('/v1/gigs')
            .set('Authorization', `Bearer ${token}`)
            .send(payload);

        expect([200, 201]).toContain(res.status);
        const gigId = res.body.data?._id ?? res.body.data?.gig?._id;
        const stored = await Gig.findById(gigId).lean();
        expect(stored?.location?.geo).toBeUndefined();
    });

    // ─── geocoding service unit tests ───────────────────────────────────

    it('geocoding service: short input returns null', async () => {
        expect(await geocodeAddress('')).toBeNull();
        expect(await geocodeAddress('  ')).toBeNull();
        expect(await geocodeAddress('abc')).toBeNull();
    });

    it('geocoding service: nominatim returns null in test env (no live fetch)', async () => {
        // NODE_ENV=test, GEOCODING_LIVE unset → guaranteed null
        const out = await geocodeAddress('Pune, Maharashtra, India');
        expect(out).toBeNull();
    });

    it('geocoding service: mock provider returns deterministic Pune coords when GEOCODING_LIVE=1', async () => {
        const prevProvider = process.env.GEOCODING_PROVIDER;
        const prevLive = process.env.GEOCODING_LIVE;
        process.env.GEOCODING_PROVIDER = 'mock';
        process.env.GEOCODING_LIVE = '1';

        try {
            const out = await geocodeAddress('Some venue, Pune, India');
            expect(out).not.toBeNull();
            expect(out!.source).toBe('mock');
            expect(out!.lat).toBeCloseTo(18.5204, 3);
            expect(out!.lng).toBeCloseTo(73.8567, 3);
        } finally {
            if (prevProvider === undefined) delete process.env.GEOCODING_PROVIDER;
            else process.env.GEOCODING_PROVIDER = prevProvider;
            if (prevLive === undefined) delete process.env.GEOCODING_LIVE;
            else process.env.GEOCODING_LIVE = prevLive;
        }
    });

    // ─── responsibilities[] round-trip (Plan 5 v2) ──────────────────────

    it('responsibilities[] persists when posted via API', async () => {
        const payload = makeGigPayload({
            responsibilities: [
                'Perform a 3-song fusion piece live at the sangeet',
                'Attend 3 rehearsals',
                'Be camera-ready for hall lighting',
            ],
        });

        const res = await request(app)
            .post('/v1/gigs')
            .set('Authorization', `Bearer ${token}`)
            .send(payload);

        expect([200, 201]).toContain(res.status);
        const gigId = res.body.data?._id ?? res.body.data?.gig?._id;
        const stored = await Gig.findById(gigId).lean();
        expect(stored?.responsibilities).toEqual([
            'Perform a 3-song fusion piece live at the sangeet',
            'Attend 3 rehearsals',
            'Be camera-ready for hall lighting',
        ]);
    });

    it('rejects responsibilities[] with > 8 items', async () => {
        const payload = makeGigPayload({
            responsibilities: Array.from({ length: 9 }, (_, i) => `Item ${i + 1}`),
        });

        const res = await request(app)
            .post('/v1/gigs')
            .set('Authorization', `Bearer ${token}`)
            .send(payload);

        expect(res.status).toBe(400);
    });

    it('rejects a responsibility string > 200 characters', async () => {
        const payload = makeGigPayload({
            responsibilities: ['x'.repeat(201)],
        });

        const res = await request(app)
            .post('/v1/gigs')
            .set('Authorization', `Bearer ${token}`)
            .send(payload);

        expect(res.status).toBe(400);
    });

    // ─── original geocoding tests continue ──────────────────────────────

    it('geocoding service: mock provider returns null for unknown city', async () => {
        const prevProvider = process.env.GEOCODING_PROVIDER;
        const prevLive = process.env.GEOCODING_LIVE;
        process.env.GEOCODING_PROVIDER = 'mock';
        process.env.GEOCODING_LIVE = '1';

        try {
            const out = await geocodeAddress('Some venue, Atlantis, Underwater');
            expect(out).toBeNull();
        } finally {
            if (prevProvider === undefined) delete process.env.GEOCODING_PROVIDER;
            else process.env.GEOCODING_PROVIDER = prevProvider;
            if (prevLive === undefined) delete process.env.GEOCODING_LIVE;
            else process.env.GEOCODING_LIVE = prevLive;
        }
    });
});
