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

    it('rejects paymentMethod values outside the enum', async () => {
        await expect(
            GigApplication.create({
                ...baseShape(),
                paymentMethod: 'crypto' as any,
            })
        ).rejects.toThrow(/paymentMethod/i);
    });
});
