/**
 * Schema-level coverage for the new GigApplication.paymentMethod field.
 *
 * Why model-level instead of supertest:
 *   `updateApplicationStatus` controller wraps its work in a Mongo
 *   transaction (`session.startTransaction()`), which requires a replica-set
 *   topology. The shared test setup uses `MongoMemoryServer` (standalone),
 *   so end-to-end PATCH /v1/applications/:id/status is not currently
 *   testable. Schema-level checks lock the field's enum + optional
 *   semantics; the controller integration is exercised by the existing
 *   gigs-service test patterns and real-device QA.
 */

import mongoose from 'mongoose';
import GigApplication from '../models/GigApplication';

describe('GigApplication.paymentMethod (schema-level)', () => {
    const baseShape = () => ({
        gigId: new mongoose.Types.ObjectId(),
        artistId: new mongoose.Types.ObjectId(),
        artistSnapshot: {
            displayName: 'A',
            artistType: 'dancer',
            profileImageUrl: '',
            rating: 0,
        },
        status: 'shortlisted' as const,
    });

    it("persists paymentMethod = 'on_platform'", async () => {
        const app = await GigApplication.create({
            ...baseShape(),
            paymentMethod: 'on_platform',
        });
        const fresh = await GigApplication.findById(app._id);
        expect(fresh?.paymentMethod).toBe('on_platform');
    });

    it("persists paymentMethod = 'off_platform'", async () => {
        const app = await GigApplication.create({
            ...baseShape(),
            paymentMethod: 'off_platform',
        });
        const fresh = await GigApplication.findById(app._id);
        expect(fresh?.paymentMethod).toBe('off_platform');
    });

    it('omitting paymentMethod leaves the field unset', async () => {
        const app = await GigApplication.create(baseShape());
        const fresh = await GigApplication.findById(app._id);
        expect(fresh?.paymentMethod).toBeUndefined();
    });

    it('persists artistSnapshot.phoneNumber when populated at hire time', async () => {
        // The updateApplicationStatus controller writes
        // application.artistSnapshot.phoneNumber from User.phoneNumber when
        // status flips to 'hired'. This schema-level test confirms the
        // model accepts + round-trips the field. (Controller integration is
        // blocked by the transaction-required test harness; documented in
        // the file header.)
        const app = await GigApplication.create({
            ...baseShape(),
            artistSnapshot: {
                displayName: 'A',
                artistType: 'dancer',
                profileImageUrl: '',
                rating: 0,
                phoneNumber: '+919876543210',
            } as any,
            status: 'hired',
        });
        const fresh = await GigApplication.findById(app._id);
        expect((fresh?.artistSnapshot as any)?.phoneNumber).toBe('+919876543210');
    });

    it('omits artistSnapshot.phoneNumber when not set (DPDP default)', async () => {
        const app = await GigApplication.create(baseShape());
        const fresh = await GigApplication.findById(app._id);
        expect((fresh?.artistSnapshot as any)?.phoneNumber).toBeUndefined();
    });

    it('rejects paymentMethod values outside the enum', async () => {
        await expect(
            GigApplication.create({
                ...baseShape(),
                paymentMethod: 'crypto' as any,
            })
        ).rejects.toThrow(/paymentMethod/i);
    });
});
