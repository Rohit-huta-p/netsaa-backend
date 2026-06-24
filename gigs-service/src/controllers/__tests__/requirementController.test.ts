// src/controllers/__tests__/requirementController.test.ts
const mockReqCreate = jest.fn();
const mockReqFind = jest.fn();
const mockReqFindOne = jest.fn();
const mockReqCount = jest.fn();
const mockReqFindById = jest.fn();
const mockOrgFindOne = jest.fn();

jest.mock('../../models/Requirement', () => ({
    __esModule: true,
    PROPOSAL_CAP: 5,
    default: {
        create: (...a: any[]) => mockReqCreate(...a),
        find: (...a: any[]) => mockReqFind(...a),
        findOne: (...a: any[]) => mockReqFindOne(...a),
        countDocuments: (...a: any[]) => mockReqCount(...a),
        findById: (...a: any[]) => mockReqFindById(...a),
    },
}));
// Read-only Organizer mirror — agency check is a server-side DB lookup, never a client flag.
jest.mock('../../models/Organizer', () => ({
    __esModule: true,
    default: { findOne: (...a: any[]) => mockOrgFindOne(...a) },
}));

// Helper: mirror Organizer.findOne(...).select(...).lean() resolving to `cat`.
const orgCategory = (cat?: string) =>
    mockOrgFindOne.mockReturnValue({ select: () => ({ lean: () => Promise.resolve(cat ? { organizerTypeCategory: cat } : null) }) });

import { createRequirement, getMyRequirements, getRequirementsFeed, getRequirementById } from '../requirementController';

const mkRes = () => {
    const res: any = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
};
const validBody = {
    title: 'Choreographer for my daughter sangeet',
    occasionText: 'Sangeet',
    description: 'Choreographer to teach 5 family dances and perform.',
    city: 'Pune',
    eventDate: '2027-03-15',
    budgetMin: 20000,
    budgetMax: 50000,
};

describe('createRequirement', () => {
    beforeEach(() => {
        [mockReqCreate, mockReqCount, mockReqFindOne, mockOrgFindOne].forEach((m) => m.mockReset());
        orgCategory(undefined); // create() now snapshots hirerType via organizerCategory()
    });

    it('403s for non-client roles', async () => {
        const res = mkRes();
        await createRequirement({ user: { id: 'u1', role: 'creative_lead' }, body: validBody } as any, res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(403);
        expect(mockReqCreate).not.toHaveBeenCalled();
    });

    it('400s on short description', async () => {
        const res = mkRes();
        await createRequirement(
            { user: { id: 'u1', role: 'client', displayName: 'A' }, body: { ...validBody, description: 'too short' } } as any,
            res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(400);
    });

    it('400s when title is missing', async () => {
        const res = mkRes();
        const { title: _t, ...noTitle } = validBody;
        await createRequirement(
            { user: { id: 'u1', role: 'client', displayName: 'A' }, body: noTitle } as any,
            res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(400);
        expect(mockReqCreate).not.toHaveBeenCalled();
    });

    it('400s when title is 4 chars (too short)', async () => {
        const res = mkRes();
        await createRequirement(
            { user: { id: 'u1', role: 'client', displayName: 'A' }, body: { ...validBody, title: 'Hi!!' } } as any,
            res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(400);
        expect(mockReqCreate).not.toHaveBeenCalled();
    });

    // New test 2: past eventDate -> 400
    it('400s when eventDate is in the past', async () => {
        const res = mkRes();
        await createRequirement(
            { user: { id: 'u1', role: 'client', displayName: 'A' }, body: { ...validBody, eventDate: '2020-01-01' } } as any,
            res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(400);
        expect(mockReqCreate).not.toHaveBeenCalled();
    });

    // New test 5: invalid budgetMin
    it('400s when budgetMin is not a number', async () => {
        const res = mkRes();
        await createRequirement(
            { user: { id: 'u1', role: 'client', displayName: 'A' }, body: { ...validBody, budgetMin: 'abc' } } as any,
            res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(400);
    });

    // New test 5: budgetMin > budgetMax -> 400
    it('400s when budgetMin exceeds budgetMax', async () => {
        const res = mkRes();
        await createRequirement(
            { user: { id: 'u1', role: 'client', displayName: 'A' }, body: { ...validBody, budgetMin: 50000, budgetMax: 20000 } } as any,
            res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(400);
    });

    // Double-tap guard: an identical recent post returns the existing doc, not a duplicate.
    it('double-tap: dedupe hit returns 200 with the existing requirement', async () => {
        mockReqFindOne.mockResolvedValue({ _id: 'r0', occasionText: 'Sangeet' });
        const res = mkRes();
        await createRequirement({ user: { id: 'u1', role: 'client', displayName: 'A' }, body: validBody } as any, res, jest.fn());
        expect(mockReqCreate).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(200);
    });

    // Open-requirement cap removed (founder decision 2026-06-13): a client with
    // existing open requirements can still post another.
    it('creates another requirement even when the client already has open ones', async () => {
        mockReqFindOne.mockResolvedValue(null); // no dedupe hit
        mockReqCreate.mockResolvedValue({ _id: 'r2', ...validBody });
        const res = mkRes();
        await createRequirement({ user: { id: 'u1', role: 'client', displayName: 'A' }, body: validBody } as any, res, jest.fn());
        expect(mockReqCreate).toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(201);
    });

    it('creates with derived occasionTag, snapshot, expiry', async () => {
        mockReqFindOne.mockResolvedValue(null);
        mockReqCount.mockResolvedValue(0);
        mockReqCreate.mockResolvedValue({ _id: 'r1', ...validBody });
        const res = mkRes();
        await createRequirement({ user: { id: 'u1', role: 'client', displayName: 'Anjali', primaryCity: 'Pune' }, body: validBody } as any, res, jest.fn());
        expect(mockReqCreate).toHaveBeenCalledWith(expect.objectContaining({
            clientId: 'u1',
            title: 'Choreographer for my daughter sangeet',
            occasionText: 'Sangeet',
            occasionTag: 'sangeet',
            clientSnapshot: expect.objectContaining({ displayName: 'Anjali' }),
            status: 'open',
            expiresAt: expect.any(Date),
        }));
        expect(res.status).toHaveBeenCalledWith(201);
    });

    it('snapshots hirerType from the client organizer category', async () => {
        mockReqFindOne.mockResolvedValue(null);
        mockReqCreate.mockResolvedValue({ _id: 'r3', ...validBody });
        orgCategory('agency');
        const res = mkRes();
        await createRequirement({ user: { id: 'u1', role: 'client', displayName: 'A' }, body: validBody } as any, res, jest.fn());
        expect(mockReqCreate).toHaveBeenCalledWith(expect.objectContaining({
            clientSnapshot: expect.objectContaining({ hirerType: 'agency' }),
        }));
        expect(res.status).toHaveBeenCalledWith(201);
    });

    it('returns the existing doc on duplicate (same client+occasion+date+city within 5 min)', async () => {
        mockReqFindOne.mockResolvedValue({ _id: 'r0', occasionText: 'Sangeet' });
        const res = mkRes();
        await createRequirement({ user: { id: 'u1', role: 'client', displayName: 'A' }, body: validBody } as any, res, jest.fn());
        expect(mockReqCreate).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(200);
    });
});

// Build the find()->sort()->skip()->limit() chain mock and return the limit spy.
const mockFeedChain = (rows: any[] = []) => {
    const limit = jest.fn().mockResolvedValue(rows);
    const sort = jest.fn().mockReturnValue({ skip: jest.fn().mockReturnValue({ limit }) });
    mockReqFind.mockReturnValue({ sort });
    return { sort, limit };
};

describe('getRequirementsFeed', () => {
    beforeEach(() => [mockReqFind, mockReqCount, mockOrgFindOne].forEach((m) => m.mockReset()));

    it('403s for non-CL', async () => {
        const res = mkRes();
        await getRequirementsFeed({ user: { id: 'u1', role: 'artist' }, query: {} } as any, res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(403);
    });

    // Agency supplier: a client flagged 'agency' on its Organizer doc may browse.
    it('agency client -> 200 and the query excludes its OWN posts', async () => {
        orgCategory('agency');
        const sorted = { sort: jest.fn().mockReturnValue({ skip: jest.fn().mockReturnValue({ limit: jest.fn().mockResolvedValue([]) }) }) };
        mockReqFind.mockReturnValue(sorted);
        const res = mkRes();
        await getRequirementsFeed({ user: { id: 'agency1', role: 'client' }, query: {} } as any, res, jest.fn());
        expect(mockReqFind).toHaveBeenCalledWith(expect.objectContaining({
            status: 'open',
            clientId: { $ne: 'agency1' },
        }));
        expect(res.status).toHaveBeenCalledWith(200);
    });

    // Plain (non-agency) client is blocked even though the role is client.
    it('plain client (non-agency) -> 403', async () => {
        orgCategory(undefined); // no organizer / not an agency
        const res = mkRes();
        await getRequirementsFeed({ user: { id: 'c1', role: 'client' }, query: {} } as any, res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(403);
        expect(mockReqFind).not.toHaveBeenCalled();
    });

    it('filters open + under-cap + city + expiry (Fix 2)', async () => {
        const sorted = { sort: jest.fn().mockReturnValue({ skip: jest.fn().mockReturnValue({ limit: jest.fn().mockResolvedValue([]) }) }) };
        mockReqFind.mockReturnValue(sorted);
        const res = mkRes();
        await getRequirementsFeed({ user: { id: 'cl1', role: 'creative_lead' }, query: { city: 'Pune' } } as any, res, jest.fn());
        const q = mockReqFind.mock.calls[0][0];
        // Base feed query unchanged.
        expect(q).toEqual(expect.objectContaining({
            status: 'open',
            proposalCount: { $lt: 5 },
            expiresAt: expect.objectContaining({ $gt: expect.any(Date) }),
        }));
        // City now combines under $and (single city => one-clause OR-group on `city`).
        const grp = q.$and.find((g: any) => Array.isArray(g.$or) && g.$or.every((c: any) => 'city' in c));
        expect(grp).toBeDefined();
        expect(grp.$or).toHaveLength(1);
        expect(res.status).toHaveBeenCalledWith(200);
    });

    // New test 3a: pageSize 'abc' -> limit clamps to 20
    it('pageSize "abc" -> clamps to default 20', async () => {
        const mockLimit = jest.fn().mockResolvedValue([]);
        const sorted = { sort: jest.fn().mockReturnValue({ skip: jest.fn().mockReturnValue({ limit: mockLimit }) }) };
        mockReqFind.mockReturnValue(sorted);
        const res = mkRes();
        await getRequirementsFeed({ user: { id: 'cl1', role: 'creative_lead' }, query: { pageSize: 'abc' } } as any, res, jest.fn());
        expect(mockLimit).toHaveBeenCalledWith(20);
    });

    // New test 3b: pageSize '500' -> clamps to 50
    it('pageSize "500" -> clamps to 50', async () => {
        const mockLimit = jest.fn().mockResolvedValue([]);
        const sorted = { sort: jest.fn().mockReturnValue({ skip: jest.fn().mockReturnValue({ limit: mockLimit }) }) };
        mockReqFind.mockReturnValue(sorted);
        const res = mkRes();
        await getRequirementsFeed({ user: { id: 'cl1', role: 'creative_lead' }, query: { pageSize: '500' } } as any, res, jest.fn());
        expect(mockLimit).toHaveBeenCalledWith(50);
    });

    // New test 4: invalid dateFrom -> 400
    it('invalid dateFrom -> 400', async () => {
        const res = mkRes();
        await getRequirementsFeed({ user: { id: 'cl1', role: 'creative_lead' }, query: { dateFrom: 'not-a-date' } } as any, res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(400);
    });

    // Find Work Batch 1 — q / multi-city / multi-occasion / budget / sort / total.

    // q -> $and OR-group over title / occasionText / description.
    it('q=dance -> $and has an OR-group over title/occasionText/description', async () => {
        mockFeedChain();
        const res = mkRes();
        await getRequirementsFeed({ user: { id: 'cl1', role: 'creative_lead' }, query: { q: 'dance' } } as any, res, jest.fn());
        const q = mockReqFind.mock.calls[0][0];
        expect(Array.isArray(q.$and)).toBe(true);
        const grp = q.$and.find((g: any) => Array.isArray(g.$or) && g.$or.some((c: any) => 'title' in c));
        expect(grp).toBeDefined();
        const fields = grp.$or.map((c: any) => Object.keys(c)[0]);
        expect(fields).toEqual(expect.arrayContaining(['title', 'occasionText', 'description']));
        expect(res.status).toHaveBeenCalledWith(200);
    });

    // Multi-city CSV -> $and OR-group with one city regex clause per city (2 cities => 2 clauses).
    it('city=Pune,Mumbai -> $and OR-group with 2 city clauses', async () => {
        mockFeedChain();
        const res = mkRes();
        await getRequirementsFeed({ user: { id: 'cl1', role: 'creative_lead' }, query: { city: 'Pune,Mumbai' } } as any, res, jest.fn());
        const q = mockReqFind.mock.calls[0][0];
        const grp = q.$and.find((g: any) => Array.isArray(g.$or) && g.$or.every((c: any) => 'city' in c));
        expect(grp).toBeDefined();
        expect(grp.$or).toHaveLength(2);
        expect(grp.$or.every((c: any) => 'city' in c)).toBe(true);
        expect(res.status).toHaveBeenCalledWith(200);
    });

    // Multi-occasion CSV -> $in on the structured tag.
    it('occasion=Wedding,Sangeet -> occasionTag $in (lowercased to match stored tags)', async () => {
        mockFeedChain();
        const res = mkRes();
        await getRequirementsFeed({ user: { id: 'cl1', role: 'creative_lead' }, query: { occasion: 'Wedding,Sangeet' } } as any, res, jest.fn());
        const q = mockReqFind.mock.calls[0][0];
        expect(q.occasionTag).toEqual({ $in: ['wedding', 'sangeet'] });
        expect(res.status).toHaveBeenCalledWith(200);
    });

    // Min budget -> budgetMax >= threshold.
    it('minBudget=50000 -> budgetMax $gte 50000', async () => {
        mockFeedChain();
        const res = mkRes();
        await getRequirementsFeed({ user: { id: 'cl1', role: 'creative_lead' }, query: { minBudget: '50000' } } as any, res, jest.fn());
        const q = mockReqFind.mock.calls[0][0];
        expect(q.budgetMax).toEqual({ $gte: 50000 });
        expect(res.status).toHaveBeenCalledWith(200);
    });

    // sort=budget -> { budgetMax: -1, createdAt: -1 }.
    it('sort=budget -> sort spec { budgetMax:-1, createdAt:-1 }', async () => {
        const { sort } = mockFeedChain();
        const res = mkRes();
        await getRequirementsFeed({ user: { id: 'cl1', role: 'creative_lead' }, query: { sort: 'budget' } } as any, res, jest.fn());
        expect(sort).toHaveBeenCalledWith({ budgetMax: -1, createdAt: -1 });
        expect(res.status).toHaveBeenCalledWith(200);
    });

    // sort=event -> { eventDate: 1 }.
    it('sort=event -> sort spec { eventDate:1 }', async () => {
        const { sort } = mockFeedChain();
        const res = mkRes();
        await getRequirementsFeed({ user: { id: 'cl1', role: 'creative_lead' }, query: { sort: 'event' } } as any, res, jest.fn());
        expect(sort).toHaveBeenCalledWith({ eventDate: 1 });
        expect(res.status).toHaveBeenCalledWith(200);
    });

    // Response carries total (from countDocuments).
    it('response data has total', async () => {
        mockFeedChain([]);
        mockReqCount.mockResolvedValue(7);
        const res = mkRes();
        await getRequirementsFeed({ user: { id: 'cl1', role: 'creative_lead' }, query: {} } as any, res, jest.fn());
        const body = res.json.mock.calls[0][0];
        expect(body.data.total).toBe(7);
        expect(res.status).toHaveBeenCalledWith(200);
    });

    // Agency preserved: clientId:{$ne} still applied alongside the new params.
    it('agency client with new params -> still excludes OWN posts (clientId $ne)', async () => {
        orgCategory('agency');
        mockFeedChain();
        const res = mkRes();
        await getRequirementsFeed(
            { user: { id: 'agency1', role: 'client' }, query: { q: 'dance', city: 'Pune,Mumbai', occasion: 'Sangeet', minBudget: '50000', sort: 'budget' } } as any,
            res, jest.fn());
        expect(mockReqFind).toHaveBeenCalledWith(expect.objectContaining({
            status: 'open',
            clientId: { $ne: 'agency1' },
        }));
        // countDocuments runs over the SAME query (own-post exclusion applies to total too).
        expect(mockReqCount).toHaveBeenCalledWith(expect.objectContaining({ clientId: { $ne: 'agency1' } }));
        expect(res.status).toHaveBeenCalledWith(200);
    });

    // Agency guard preserved: a plain (non-agency) client is still 403 even with the new params.
    it('plain client (non-agency) with new params -> still 403', async () => {
        orgCategory(undefined);
        const res = mkRes();
        await getRequirementsFeed(
            { user: { id: 'c1', role: 'client' }, query: { q: 'dance', sort: 'budget' } } as any,
            res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(403);
        expect(mockReqFind).not.toHaveBeenCalled();
    });
});

describe('getRequirementById', () => {
    beforeEach(() => [mockReqFindById, mockOrgFindOne].forEach((m) => m.mockReset()));

    it('404s on missing', async () => {
        mockReqFindById.mockResolvedValue(null);
        const res = mkRes();
        await getRequirementById({ user: { id: 'u1', role: 'client' }, params: { id: 'x' } } as any, res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(404);
    });

    it('403s when viewer is neither owner nor CL', async () => {
        mockReqFindById.mockResolvedValue({ _id: 'r1', clientId: 'OTHER', toObject: () => ({ _id: 'r1' }) });
        const res = mkRes();
        await getRequirementById({ user: { id: 'u1', role: 'artist' }, params: { id: 'r1' } } as any, res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(403);
    });

    // Agency supplier (non-owner) may view another client's requirement detail.
    it('agency (non-owner) -> 200', async () => {
        mockReqFindById.mockResolvedValue({ _id: 'r1', clientId: 'OTHER' });
        orgCategory('agency');
        const res = mkRes();
        await getRequirementById({ user: { id: 'agency1', role: 'client' }, params: { id: 'r1' } } as any, res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(200);
    });

    // Plain (non-agency) client who does NOT own the requirement is blocked.
    it('plain non-owner client -> 403', async () => {
        mockReqFindById.mockResolvedValue({ _id: 'r1', clientId: 'OTHER' });
        orgCategory(undefined);
        const res = mkRes();
        await getRequirementById({ user: { id: 'c1', role: 'client' }, params: { id: 'r1' } } as any, res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(403);
    });
});

describe('getMyRequirements', () => {
    it("returns the client's own list newest-first", async () => {
        const sorted = { sort: jest.fn().mockResolvedValue([{ _id: 'r1' }]) };
        mockReqFind.mockReturnValue(sorted);
        const res = mkRes();
        await getMyRequirements({ user: { id: 'u1', role: 'client' }, query: {} } as any, res, jest.fn());
        expect(mockReqFind).toHaveBeenCalledWith({ clientId: 'u1' });
        expect(res.status).toHaveBeenCalledWith(200);
    });
});
