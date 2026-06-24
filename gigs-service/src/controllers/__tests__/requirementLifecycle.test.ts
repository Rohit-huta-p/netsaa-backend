// src/controllers/__tests__/requirementLifecycle.test.ts
const mockFindById = jest.fn();
const mockFindOneAndUpdate = jest.fn();

jest.mock('../../models/Requirement', () => ({
    __esModule: true,
    PROPOSAL_CAP: 5,
    default: {
        findById: (...a: any[]) => mockFindById(...a),
        findOneAndUpdate: (...a: any[]) => mockFindOneAndUpdate(...a),
    },
}));

import { editRequirement, changeRequirementStatus } from '../requirementController';

const mkRes = () => {
    const res: any = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
};
const owner = { id: 'c1', role: 'client' };

describe('editRequirement', () => {
    beforeEach(() => [mockFindById, mockFindOneAndUpdate].forEach((m) => m.mockReset()));

    it('403s a non-owner', async () => {
        mockFindById.mockResolvedValue({ _id: 'r1', clientId: 'OTHER', proposalCount: 0 });
        const res = mkRes();
        await editRequirement({ user: owner, params: { id: 'r1' }, body: { description: 'x'.repeat(25) } } as any, res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(403);
    });

    it('before any proposal: allows editing core terms', async () => {
        mockFindById.mockResolvedValue({ _id: 'r1', clientId: 'c1', proposalCount: 0 });
        mockFindOneAndUpdate.mockResolvedValue({ _id: 'r1', city: 'Mumbai' });
        const res = mkRes();
        await editRequirement({ user: owner, params: { id: 'r1' }, body: { city: 'Mumbai', description: 'A new and sufficiently long description here.' } } as any, res, jest.fn());
        expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
            { _id: 'r1' },
            { $set: expect.objectContaining({ city: 'Mumbai' }) },
            expect.objectContaining({ new: true }),
        );
        expect(res.status).toHaveBeenCalledWith(200);
    });

    it('after proposals: rejects a locked core-term change with 409', async () => {
        mockFindById.mockResolvedValue({ _id: 'r1', clientId: 'c1', proposalCount: 2 });
        const res = mkRes();
        await editRequirement({ user: owner, params: { id: 'r1' }, body: { budgetMin: 99999 } } as any, res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(409);
        expect(mockFindOneAndUpdate).not.toHaveBeenCalled();
    });

    it('after proposals: allows description/photos only', async () => {
        mockFindById.mockResolvedValue({ _id: 'r1', clientId: 'c1', proposalCount: 2 });
        mockFindOneAndUpdate.mockResolvedValue({ _id: 'r1' });
        const res = mkRes();
        await editRequirement({ user: owner, params: { id: 'r1' }, body: { description: 'Updated, still twenty plus chars long.' } } as any, res, jest.fn());
        expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
            { _id: 'r1' },
            { $set: { description: 'Updated, still twenty plus chars long.' } },
            expect.objectContaining({ new: true }),
        );
        expect(res.status).toHaveBeenCalledWith(200);
    });

    it('after proposals: title is NOT locked — edit succeeds with 200', async () => {
        mockFindById.mockResolvedValue({ _id: 'r1', clientId: 'c1', proposalCount: 3 });
        mockFindOneAndUpdate.mockResolvedValue({ _id: 'r1', title: 'Updated sangeet title for my daughter' });
        const res = mkRes();
        await editRequirement(
            { user: owner, params: { id: 'r1' }, body: { title: 'Updated sangeet title for my daughter' } } as any,
            res, jest.fn(),
        );
        expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
            { _id: 'r1' },
            { $set: expect.objectContaining({ title: 'Updated sangeet title for my daughter' }) },
            expect.objectContaining({ new: true }),
        );
        expect(res.status).toHaveBeenCalledWith(200);
    });
});

describe('changeRequirementStatus', () => {
    beforeEach(() => [mockFindById, mockFindOneAndUpdate].forEach((m) => m.mockReset()));

    it('owner stop: open -> closed', async () => {
        mockFindById.mockResolvedValue({ _id: 'r1', clientId: 'c1', status: 'open' });
        mockFindOneAndUpdate.mockResolvedValue({ _id: 'r1', status: 'closed' });
        const res = mkRes();
        await changeRequirementStatus({ user: owner, params: { id: 'r1' }, body: { action: 'stop' } } as any, res, jest.fn());
        expect(mockFindOneAndUpdate).toHaveBeenCalledWith({ _id: 'r1', status: 'open' }, { $set: { status: 'closed' } }, expect.anything());
        expect(res.status).toHaveBeenCalledWith(200);
    });

    it('owner reopen: closed -> open', async () => {
        mockFindById.mockResolvedValue({ _id: 'r1', clientId: 'c1', status: 'closed' });
        mockFindOneAndUpdate.mockResolvedValue({ _id: 'r1', status: 'open' });
        const res = mkRes();
        await changeRequirementStatus({ user: owner, params: { id: 'r1' }, body: { action: 'reopen' } } as any, res, jest.fn());
        expect(mockFindOneAndUpdate).toHaveBeenCalledWith({ _id: 'r1', status: 'closed' }, { $set: { status: 'open' } }, expect.anything());
        expect(res.status).toHaveBeenCalledWith(200);
    });

    it('owner cancel: open -> cancelled', async () => {
        mockFindById.mockResolvedValue({ _id: 'r1', clientId: 'c1', status: 'open' });
        mockFindOneAndUpdate.mockResolvedValue({ _id: 'r1', status: 'cancelled' });
        const res = mkRes();
        await changeRequirementStatus({ user: owner, params: { id: 'r1' }, body: { action: 'cancel' } } as any, res, jest.fn());
        expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
            { _id: 'r1', status: { $in: ['open', 'in_discussion'] } },
            { $set: { status: 'cancelled' } },
            expect.anything(),
        );
        expect(res.status).toHaveBeenCalledWith(200);
    });

    it('owner mark-booked: in_discussion -> booked', async () => {
        mockFindById.mockResolvedValue({ _id: 'r1', clientId: 'c1', status: 'in_discussion' });
        mockFindOneAndUpdate.mockResolvedValue({ _id: 'r1', status: 'booked' });
        const res = mkRes();
        await changeRequirementStatus({ user: owner, params: { id: 'r1' }, body: { action: 'book' } } as any, res, jest.fn());
        expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
            { _id: 'r1', status: { $in: ['open', 'in_discussion'] } },
            { $set: { status: 'booked' } },
            expect.anything(),
        );
        expect(res.status).toHaveBeenCalledWith(200);
    });

    it('cancel-from-booked → 409 (illegal transition)', async () => {
        mockFindById.mockResolvedValue({ _id: 'r1', clientId: 'c1', status: 'booked' });
        mockFindOneAndUpdate.mockResolvedValue(null); // guard blocked it
        const res = mkRes();
        await changeRequirementStatus({ user: owner, params: { id: 'r1' }, body: { action: 'cancel' } } as any, res, jest.fn());
        expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
            { _id: 'r1', status: { $in: ['open', 'in_discussion'] } },
            { $set: { status: 'cancelled' } },
            expect.anything(),
        );
        expect(res.status).toHaveBeenCalledWith(409);
    });

    it('book-from-cancelled → 409 (illegal transition)', async () => {
        mockFindById.mockResolvedValue({ _id: 'r1', clientId: 'c1', status: 'cancelled' });
        mockFindOneAndUpdate.mockResolvedValue(null); // guard blocked it
        const res = mkRes();
        await changeRequirementStatus({ user: owner, params: { id: 'r1' }, body: { action: 'book' } } as any, res, jest.fn());
        expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
            { _id: 'r1', status: { $in: ['open', 'in_discussion'] } },
            { $set: { status: 'booked' } },
            expect.anything(),
        );
        expect(res.status).toHaveBeenCalledWith(409);
    });

    it('403s non-owner', async () => {
        mockFindById.mockResolvedValue({ _id: 'r1', clientId: 'OTHER', status: 'open' });
        const res = mkRes();
        await changeRequirementStatus({ user: owner, params: { id: 'r1' }, body: { action: 'stop' } } as any, res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(403);
    });

    it('400s an invalid action', async () => {
        mockFindById.mockResolvedValue({ _id: 'r1', clientId: 'c1', status: 'open' });
        const res = mkRes();
        await changeRequirementStatus({ user: owner, params: { id: 'r1' }, body: { action: 'explode' } } as any, res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(400);
    });
});
