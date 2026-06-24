// src/controllers/__tests__/proposalController.test.ts
const mockReqFindOneAndUpdate = jest.fn();
const mockReqFindById = jest.fn();
const mockReqFind = jest.fn();
const mockPropCreate = jest.fn();
const mockPropFind = jest.fn();
const mockPropFindById = jest.fn();
const mockPropFindOneAndUpdate = jest.fn();
const mockPropUpdateMany = jest.fn();
const mockInviteFindOne = jest.fn();
const mockOrgFindOne = jest.fn();

jest.mock('../../models/Requirement', () => ({
    __esModule: true,
    PROPOSAL_CAP: 5,
    default: {
        findOneAndUpdate: (...a: any[]) => mockReqFindOneAndUpdate(...a),
        findById: (...a: any[]) => mockReqFindById(...a),
        find: (...a: any[]) => mockReqFind(...a),
    },
}));
jest.mock('../../models/Proposal', () => ({
    __esModule: true,
    default: {
        create: (...a: any[]) => mockPropCreate(...a),
        find: (...a: any[]) => mockPropFind(...a),
        findById: (...a: any[]) => mockPropFindById(...a),
        findOneAndUpdate: (...a: any[]) => mockPropFindOneAndUpdate(...a),
        updateMany: (...a: any[]) => mockPropUpdateMany(...a),
    },
}));
jest.mock('../../models/Invite', () => ({ __esModule: true, default: { findOne: (...a: any[]) => mockInviteFindOne(...a) } }));
// Read-only Organizer mirror — agency check is a server-side DB lookup, never a client flag.
jest.mock('../../models/Organizer', () => ({
    __esModule: true,
    default: { findOne: (...a: any[]) => mockOrgFindOne(...a) },
}));

// Helper: mirror Organizer.findOne(...).select(...).lean() resolving to `cat`.
const orgCategory = (cat?: string) =>
    mockOrgFindOne.mockReturnValue({ select: () => ({ lean: () => Promise.resolve(cat ? { organizerTypeCategory: cat } : null) }) });

import { createProposal, getProposalsForRequirement, getMyProposals, patchProposal } from '../proposalController';

const mkRes = () => {
    const res: any = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
};
const clBody = { pitch: 'I have run 50+ sangeets in Pune and can bring a 4-dancer team.', quoteAmount: 45000 };

describe('getMyProposals', () => {
    beforeEach(() => { mockPropFind.mockReset(); mockReqFind.mockReset(); });

    it("returns the lead's sent proposals joined with requirement basics", async () => {
        mockPropFind.mockReturnValue({
            sort: () => ({ lean: () => Promise.resolve([
                { _id: 'p1', requirementId: 'r1', leadId: 'u1', quoteAmount: 45000, status: 'viewed' },
            ]) }),
        });
        mockReqFind.mockReturnValue({
            select: () => ({ lean: () => Promise.resolve([
                { _id: 'r1', title: 'Sangeet choreographer', city: 'Pune', status: 'open' },
            ]) }),
        });
        const res = mkRes();
        await getMyProposals({ user: { id: 'u1' } } as any, res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(200);
        const payload = res.json.mock.calls[0][0];
        expect(payload.data.proposals).toHaveLength(1);
        expect(payload.data.proposals[0].requirement.title).toBe('Sangeet choreographer');
    });

    it('returns an empty list when the lead has sent none (no requirement lookup)', async () => {
        mockPropFind.mockReturnValue({ sort: () => ({ lean: () => Promise.resolve([]) }) });
        const res = mkRes();
        await getMyProposals({ user: { id: 'u1' } } as any, res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json.mock.calls[0][0].data.proposals).toEqual([]);
        expect(mockReqFind).not.toHaveBeenCalled();
    });
});

describe('createProposal', () => {
    beforeEach(() => [mockReqFindOneAndUpdate, mockPropCreate, mockReqFindById, mockOrgFindOne].forEach((m) => m.mockReset()));

    it('403s for plain (non-agency) client', async () => {
        orgCategory(undefined); // not an agency
        const res = mkRes();
        await createProposal({ user: { id: 'u1', role: 'client' }, params: { id: 'r1' }, body: clBody } as any, res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(403);
        expect(mockReqFindOneAndUpdate).not.toHaveBeenCalled();
    });

    it('409s when requirement is closed or at cap (atomic guard returns null)', async () => {
        mockReqFindOneAndUpdate.mockResolvedValue(null);
        const res = mkRes();
        await createProposal({ user: { id: 'cl1', role: 'creative_lead', displayName: 'P' }, params: { id: 'r1' }, body: clBody } as any, res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(409);
        expect(mockPropCreate).not.toHaveBeenCalled();
    });

    it('creates and the slot was reserved atomically', async () => {
        mockReqFindOneAndUpdate.mockResolvedValue({ _id: 'r1', proposalCount: 1 });
        mockPropCreate.mockResolvedValue({ _id: 'p1' });
        const res = mkRes();
        await createProposal({ user: { id: 'cl1', role: 'creative_lead', displayName: 'Priya' }, params: { id: 'r1' }, body: clBody } as any, res, jest.fn());
        expect(mockReqFindOneAndUpdate).toHaveBeenCalledWith(
            { _id: 'r1', status: 'open', proposalCount: { $lt: 5 } },
            { $inc: { proposalCount: 1 } },
            { new: true },
        );
        expect(res.status).toHaveBeenCalledWith(201);
    });

    it('rolls back the counter on duplicate proposal (unique index violation)', async () => {
        mockReqFindOneAndUpdate.mockResolvedValueOnce({ _id: 'r1' });
        const dup: any = new Error('dup');
        dup.code = 11000;
        mockPropCreate.mockRejectedValue(dup);
        mockReqFindOneAndUpdate.mockResolvedValueOnce({ _id: 'r1' });
        const res = mkRes();
        await createProposal({ user: { id: 'cl1', role: 'creative_lead', displayName: 'P' }, params: { id: 'r1' }, body: clBody } as any, res, jest.fn());
        expect(mockReqFindOneAndUpdate).toHaveBeenLastCalledWith({ _id: 'r1' }, { $inc: { proposalCount: -1 } });
        expect(res.status).toHaveBeenCalledWith(409);
    });

    it('400s on a short pitch', async () => {
        const res = mkRes();
        await createProposal({ user: { id: 'cl1', role: 'creative_lead' }, params: { id: 'r1' }, body: { pitch: 'short' } } as any, res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(400);
    });

    // New test 6: non-duplicate create failure (ValidationError) -> rollback decrement called AND response 400
    it('rolls back and returns 400 when create fails with ValidationError', async () => {
        mockReqFindOneAndUpdate.mockResolvedValueOnce({ _id: 'r1' }); // slot reservation succeeds
        const valErr: any = new Error('Path `pitch` is required.');
        valErr.name = 'ValidationError';
        mockPropCreate.mockRejectedValue(valErr);
        mockReqFindOneAndUpdate.mockResolvedValueOnce({}); // rollback
        const res = mkRes();
        await createProposal({ user: { id: 'cl1', role: 'creative_lead', displayName: 'P' }, params: { id: 'r1' }, body: clBody } as any, res, jest.fn());
        // rollback decrement was called
        expect(mockReqFindOneAndUpdate).toHaveBeenLastCalledWith({ _id: 'r1' }, { $inc: { proposalCount: -1 } });
        expect(res.status).toHaveBeenCalledWith(400);
    });
});

describe('getProposalsForRequirement', () => {
    beforeEach(() => [mockReqFindById, mockPropFind, mockPropUpdateMany].forEach((m) => m.mockReset()));

    it('403s when viewer is not the requirement owner', async () => {
        mockReqFindById.mockResolvedValue({ _id: 'r1', clientId: 'OTHER' });
        const res = mkRes();
        await getProposalsForRequirement({ user: { id: 'u1', role: 'client' }, params: { id: 'r1' } } as any, res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(403);
    });

    it('flips sent->viewed BEFORE listing proposals (Fix 9)', async () => {
        mockReqFindById.mockResolvedValue({ _id: 'r1', clientId: 'u1' });
        const callOrder: string[] = [];
        mockPropUpdateMany.mockImplementation(() => {
            callOrder.push('updateMany');
            return Promise.resolve({});
        });
        const sorted = {
            sort: jest.fn().mockImplementation(() => {
                callOrder.push('find');
                return Promise.resolve([{ _id: 'p1' }]);
            }),
        };
        mockPropFind.mockReturnValue(sorted);
        const res = mkRes();
        await getProposalsForRequirement({ user: { id: 'u1', role: 'client' }, params: { id: 'r1' } } as any, res, jest.fn());
        expect(mockPropUpdateMany).toHaveBeenCalledWith(
            { requirementId: 'r1', status: 'sent' },
            expect.objectContaining({ $set: { status: 'viewed' } }),
        );
        expect(callOrder[0]).toBe('updateMany');
        expect(callOrder[1]).toBe('find');
        expect(res.status).toHaveBeenCalledWith(200);
    });
});

describe('patchProposal', () => {
    beforeEach(() => [mockPropFindById, mockReqFindById, mockReqFindOneAndUpdate, mockPropFindOneAndUpdate].forEach((m) => m.mockReset()));

    const proposal = (status = 'viewed') => ({
        _id: 'p1', requirementId: 'r1', leadId: 'cl1', status,
        timeline: [],
    });

    it('owner accepts -> proposal accepted + requirement moves to in_discussion', async () => {
        const p = proposal();
        mockPropFindById.mockResolvedValue(p);
        mockReqFindById.mockResolvedValue({ _id: 'r1', clientId: 'u1', status: 'open' });
        const accepted = { ...p, status: 'accepted' };
        mockPropFindOneAndUpdate.mockResolvedValue(accepted);
        mockReqFindOneAndUpdate.mockResolvedValue({});
        const res = mkRes();
        await patchProposal({ user: { id: 'u1', role: 'client' }, params: { id: 'p1' }, body: { action: 'accept' } } as any, res, jest.fn());
        expect(mockPropFindOneAndUpdate).toHaveBeenCalledWith(
            { _id: 'p1', status: { $in: ['sent', 'viewed'] } },
            expect.objectContaining({ $set: { status: 'accepted' } }),
            { new: true },
        );
        expect(res.status).toHaveBeenCalledWith(200);
    });

    it('CL withdraws own proposal -> atomic flip and conditioned slot decrement', async () => {
        const p = proposal('sent');
        mockPropFindById.mockResolvedValue(p);
        mockReqFindById.mockResolvedValue({ _id: 'r1', clientId: 'u1' });
        const withdrawn = { ...p, status: 'withdrawn' };
        mockPropFindOneAndUpdate.mockResolvedValue(withdrawn);
        mockReqFindOneAndUpdate.mockResolvedValue({});
        const res = mkRes();
        await patchProposal({ user: { id: 'cl1', role: 'creative_lead' }, params: { id: 'p1' }, body: { action: 'withdraw' } } as any, res, jest.fn());
        expect(mockPropFindOneAndUpdate).toHaveBeenCalledWith(
            { _id: 'p1', leadId: 'cl1', status: { $in: ['sent', 'viewed'] } },
            expect.objectContaining({ $set: { status: 'withdrawn' } }),
            { new: true },
        );
        // Fix 1: conditioned decrement predicate asserted
        expect(mockReqFindOneAndUpdate).toHaveBeenCalledWith(
            { _id: 'r1', proposalCount: { $gt: 0 } },
            { $inc: { proposalCount: -1 } },
        );
        expect(res.status).toHaveBeenCalledWith(200);
    });

    it('403s when a stranger patches', async () => {
        mockPropFindById.mockResolvedValue(proposal());
        mockReqFindById.mockResolvedValue({ _id: 'r1', clientId: 'OTHER' });
        const res = mkRes();
        await patchProposal({ user: { id: 'stranger', role: 'client' }, params: { id: 'p1' }, body: { action: 'accept' } } as any, res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(403);
    });

    it('400s on invalid transitions — findOneAndUpdate returns null', async () => {
        // proposal is in 'withdrawn' state; findOneAndUpdate condition won't match -> null
        const p = proposal('withdrawn');
        mockPropFindById.mockResolvedValue(p);
        mockReqFindById.mockResolvedValue({ _id: 'r1', clientId: 'u1' });
        // atomic update returns null because status is NOT in ['sent','viewed']
        mockPropFindOneAndUpdate.mockResolvedValue(null);
        const res = mkRes();
        await patchProposal({ user: { id: 'u1', role: 'client' }, params: { id: 'p1' }, body: { action: 'accept' } } as any, res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(400);
    });

    // New test 7: withdraw on already-withdrawn -> 400; conditioned decrement predicate asserted
    it('withdraw on already-withdrawn (findOneAndUpdate null) -> 400', async () => {
        const p = proposal('withdrawn');
        mockPropFindById.mockResolvedValue(p);
        mockReqFindById.mockResolvedValue({ _id: 'r1', clientId: 'u1' });
        // atomic flip returns null -> proposal is already terminal
        mockPropFindOneAndUpdate.mockResolvedValue(null);
        const res = mkRes();
        await patchProposal({ user: { id: 'cl1', role: 'creative_lead' }, params: { id: 'p1' }, body: { action: 'withdraw' } } as any, res, jest.fn());
        // should 400, not release slot
        expect(res.status).toHaveBeenCalledWith(400);
        expect(mockReqFindOneAndUpdate).not.toHaveBeenCalled();
    });
});

describe('createProposal — invited-artist exception', () => {
    beforeEach(() => [mockInviteFindOne, mockReqFindOneAndUpdate, mockPropCreate].forEach((m) => m.mockReset()));

    it('artist WITHOUT an invite for this requirement → 403', async () => {
        mockInviteFindOne.mockResolvedValue(null);
        const res = mkRes();
        await createProposal({ user: { id: 'a1', role: 'artist', displayName: 'Ravi' }, params: { id: 'r1' }, body: { pitch: 'x'.repeat(25) } } as any, res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(403);
        expect(mockInviteFindOne).toHaveBeenCalledWith(expect.objectContaining({
            toUserId: 'a1', requirementId: 'r1', status: { $in: ['sent', 'viewed', 'accepted'] },
        }));
    });

    it('artist WITH a valid invite for this requirement → proposal created', async () => {
        mockInviteFindOne.mockResolvedValue({ _id: 'i1' });
        mockReqFindOneAndUpdate.mockResolvedValue({ _id: 'r1', proposalCount: 1 });
        mockPropCreate.mockResolvedValue({ _id: 'p1' });
        const res = mkRes();
        await createProposal({ user: { id: 'a1', role: 'artist', displayName: 'Ravi' }, params: { id: 'r1' }, body: { pitch: 'I would love to perform at your event for sure.' } } as any, res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(201);
    });

    it('creative_lead path is unchanged (no invite lookup needed)', async () => {
        mockReqFindOneAndUpdate.mockResolvedValue({ _id: 'r1' });
        mockPropCreate.mockResolvedValue({ _id: 'p2' });
        const res = mkRes();
        await createProposal({ user: { id: 'cl1', role: 'creative_lead', displayName: 'P' }, params: { id: 'r1' }, body: { pitch: 'I have run many sangeets in the city.' } } as any, res, jest.fn());
        expect(mockInviteFindOne).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(201);
    });
});

describe('createProposal — agency-supplier exception', () => {
    beforeEach(() => [mockOrgFindOne, mockReqFindById, mockReqFindOneAndUpdate, mockPropCreate].forEach((m) => m.mockReset()));

    // findById(id).select('clientId') -> resolves to the requirement (or null).
    const reqOwnedBy = (clientId: string | null) =>
        mockReqFindById.mockReturnValue({ select: () => Promise.resolve(clientId == null ? null : { _id: 'r1', clientId }) });

    it("agency proposing on ANOTHER client's requirement -> 201 (reaches past the guard)", async () => {
        orgCategory('agency');
        reqOwnedBy('SOMEONE_ELSE');
        mockReqFindOneAndUpdate.mockResolvedValue({ _id: 'r1', proposalCount: 1 });
        mockPropCreate.mockResolvedValue({ _id: 'p1' });
        const res = mkRes();
        await createProposal({ user: { id: 'agency1', role: 'client', displayName: 'Agency Co' }, params: { id: 'r1' }, body: { pitch: 'We staff full crews for sangeets across Pune.' } } as any, res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(201);
    });

    it('agency proposing on its OWN requirement -> 403 (never bids on itself)', async () => {
        orgCategory('agency');
        reqOwnedBy('agency1'); // owner === viewer
        const res = mkRes();
        await createProposal({ user: { id: 'agency1', role: 'client', displayName: 'Agency Co' }, params: { id: 'r1' }, body: { pitch: 'We staff full crews for sangeets across Pune.' } } as any, res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(403);
        expect(mockReqFindOneAndUpdate).not.toHaveBeenCalled();
        expect(mockPropCreate).not.toHaveBeenCalled();
    });
});
