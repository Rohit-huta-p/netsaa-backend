// netsa-backend/gigs-service/src/tests/gig-booking-terms.test.ts
//
// Phase 2A: round-trip tests for paymentStructure + cancellationPolicy on Gig.
// Verifies the new optional enums save, retrieve, and reject invalid values.
//
// Test JWTs are signed with role 'organizer' so requests pass through the
// auth middleware on POST /v1/gigs (seed step) and PATCH /v1/gigs/:id.
// Mongo + JWT setup live in ./setup.ts (mongodb-memory-server boot, per-test
// collection cleanup, JWT secret pin). Gig payload factory is the same one
// used by the rest of the gigs-service test suite.
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../app';
import Gig from '../models/Gig';
import { authTokenFor } from './setup';
import { makeGigPayload } from './fixtures/gigFactory';

describe('Gig booking terms — Phase 2A', () => {
    let organizerId: string;
    let token: string;

    beforeEach(() => {
        organizerId = new mongoose.Types.ObjectId().toString();
        token = authTokenFor(organizerId, 'organizer');
    });

    async function seedGig(overrides: Record<string, unknown> = {}): Promise<string> {
        const payload = makeGigPayload(overrides);
        const res = await request(app)
            .post('/v1/gigs')
            .set('Authorization', `Bearer ${token}`)
            .send(payload);
        return res.body.data?._id ?? res.body.data?.gig?._id;
    }

    it('PATCH /v1/gigs/:id accepts paymentStructure: advance_balance', async () => {
        const gigId = await seedGig();

        const res = await request(app)
            .patch(`/v1/gigs/${gigId}`)
            .set('Authorization', `Bearer ${token}`)
            .send({ paymentStructure: 'advance_balance' });

        expect(res.status).toBe(200);
        const fresh = await Gig.findById(gigId).lean();
        expect(fresh!.paymentStructure).toBe('advance_balance');
    });

    it('PATCH /v1/gigs/:id accepts cancellationPolicy: 72h', async () => {
        const gigId = await seedGig();

        const res = await request(app)
            .patch(`/v1/gigs/${gigId}`)
            .set('Authorization', `Bearer ${token}`)
            .send({ cancellationPolicy: '72h' });

        expect(res.status).toBe(200);
        const fresh = await Gig.findById(gigId).lean();
        expect(fresh!.cancellationPolicy).toBe('72h');
    });

    it('PATCH rejects invalid paymentStructure value', async () => {
        const gigId = await seedGig();

        const res = await request(app)
            .patch(`/v1/gigs/${gigId}`)
            .set('Authorization', `Bearer ${token}`)
            .send({ paymentStructure: 'foo' });

        expect(res.status).toBe(400);
    });

    it('PATCH rejects invalid cancellationPolicy value', async () => {
        const gigId = await seedGig();

        const res = await request(app)
            .patch(`/v1/gigs/${gigId}`)
            .set('Authorization', `Bearer ${token}`)
            .send({ cancellationPolicy: 'never' });

        expect(res.status).toBe(400);
    });

    it('GET returns the new fields with their stored values', async () => {
        const gigId = await seedGig({
            paymentStructure: 'advance_balance',
            cancellationPolicy: '24h',
        });

        const res = await request(app)
            .get(`/v1/gigs/${gigId}`)
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(res.body.data.paymentStructure).toBe('advance_balance');
        expect(res.body.data.cancellationPolicy).toBe('24h');
    });

    it('PATCH /v1/gigs/:id accepts cancellationForfeitPct: 50', async () => {
        const gigId = await seedGig();

        const res = await request(app)
            .patch(`/v1/gigs/${gigId}`)
            .set('Authorization', `Bearer ${token}`)
            .send({ cancellationForfeitPct: 50 });

        expect(res.status).toBe(200);
        const fresh = await Gig.findById(gigId).lean();
        expect(fresh!.cancellationForfeitPct).toBe(50);
    });

    it('PATCH rejects cancellationForfeitPct > 100', async () => {
        const gigId = await seedGig();

        const res = await request(app)
            .patch(`/v1/gigs/${gigId}`)
            .set('Authorization', `Bearer ${token}`)
            .send({ cancellationForfeitPct: 150 });

        expect(res.status).toBe(400);
    });
});
