// src/controllers/__tests__/inviteController.test.ts
const mockInviteCreate = jest.fn();
const mockInviteFind = jest.fn();
const mockInviteFindById = jest.fn();
const mockReqFindById = jest.fn();
const mockUserFindById = jest.fn();
const mockOrganizerCategory = jest.fn();

jest.mock('../../models/Invite', () => ({
    __esModule: true,
    default: {
        create: (...a: any[]) => mockInviteCreate(...a),
        find: (...a: any[]) => mockInviteFind(...a),
        findById: (...a: any[]) => mockInviteFindById(...a),
    },
}));
jest.mock('../../models/Requirement', () => ({
    __esModule: true,
    PROPOSAL_CAP: 5,
    default: { findById: (...a: any[]) => mockReqFindById(...a) },
}));
jest.mock('../../models/User', () => ({
    __esModule: true,
    default: { findById: (...a: any[]) => mockUserFindById(...a) },
}));
jest.mock('../../utils/agency', () => ({
    __esModule: true,
    organizerCategory: (...a: any[]) => mockOrganizerCategory(...a),
}));

import { createInvite, getReceivedInvites, getSentInvites, respondToInvite, withdrawInvite } from '../inviteController';

// Mirror User.findById(id).select(...).lean() resolving to the recipient doc (or null).
const recipientUser = (u: any) =>
    mockUserFindById.mockReturnValue({ select: () => ({ lean: () => Promise.resolve(u) }) });

const mkRes = () => {
    const res: any = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
};

describe('createInvite', () => {
    beforeEach(() => {
        [mockInviteCreate, mockReqFindById, mockOrganizerCategory, mockUserFindById].forEach((m) => m.mockReset());
        recipientUser({ displayName: 'Recipient', profileImageUrl: undefined, cached: {} }); // default; override per-test
    });

    it('403s for non-client roles', async () => {
        const res = mkRes();
        await createInvite({ user: { id: 'cl1', role: 'creative_lead' }, body: { toUserId: 'a1', toRole: 'artist' } } as any, res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(403);
    });

    it('400s without toUserId/toRole', async () => {
        const res = mkRes();
        await createInvite({ user: { id: 'c1', role: 'client', displayName: 'A' }, body: {} } as any, res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(400);
    });

    it('requirement-attached: validates the requirement is the client\'s own and open', async () => {
        mockReqFindById.mockResolvedValue({ _id: 'r1', clientId: 'c1', status: 'open', title: 'Sangeet' });
        mockInviteCreate.mockResolvedValue({ _id: 'i1' });
        const res = mkRes();
        await createInvite({ user: { id: 'c1', role: 'client', displayName: 'A' }, body: { toUserId: 'a1', toRole: 'artist', requirementId: 'r1' } } as any, res, jest.fn());
        expect(mockInviteCreate).toHaveBeenCalledWith(expect.objectContaining({
            fromClientId: 'c1', toUserId: 'a1', toRole: 'artist', requirementId: 'r1', requirementTitle: 'Sangeet', status: 'sent',
        }));
        expect(res.status).toHaveBeenCalledWith(201);
    });

    it('403s when attaching a requirement the client does not own', async () => {
        mockReqFindById.mockResolvedValue({ _id: 'r1', clientId: 'OTHER', status: 'open' });
        const res = mkRes();
        await createInvite({ user: { id: 'c1', role: 'client', displayName: 'A' }, body: { toUserId: 'a1', toRole: 'artist', requirementId: 'r1' } } as any, res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(403);
        expect(mockInviteCreate).not.toHaveBeenCalled();
    });

    it('context-free: creates with requirementId null + note', async () => {
        mockInviteCreate.mockResolvedValue({ _id: 'i2' });
        const res = mkRes();
        await createInvite({ user: { id: 'c1', role: 'client', displayName: 'A' }, body: { toUserId: 'a1', toRole: 'artist', note: 'Loved your reel' } } as any, res, jest.fn());
        expect(mockInviteCreate).toHaveBeenCalledWith(expect.objectContaining({ requirementId: null, note: 'Loved your reel' }));
        expect(res.status).toHaveBeenCalledWith(201);
        // artist/CL invites must not pay for the agency lookup
        expect(mockOrganizerCategory).not.toHaveBeenCalled();
    });

    it('captures the recipient as toSnapshot (displayName/avatarUrl/city) at create time', async () => {
        recipientUser({ displayName: 'Ravi Kumar', profileImageUrl: 'https://cdn.netsa/ravi.jpg', cached: { primaryCity: 'Pune' } });
        mockInviteCreate.mockResolvedValue({ _id: 'i4' });
        const res = mkRes();
        await createInvite({ user: { id: 'c1', role: 'client', displayName: 'A' }, body: { toUserId: 'a1', toRole: 'artist', note: 'Loved your reel' } } as any, res, jest.fn());
        expect(mockUserFindById).toHaveBeenCalledWith('a1');
        expect(mockInviteCreate).toHaveBeenCalledWith(expect.objectContaining({
            toUserId: 'a1',
            toSnapshot: { displayName: 'Ravi Kumar', avatarUrl: 'https://cdn.netsa/ravi.jpg', city: 'Pune' },
        }));
        expect(res.status).toHaveBeenCalledWith(201);
    });

    it('still creates the invite (toSnapshot undefined) when the recipient cannot be found', async () => {
        recipientUser(null);
        mockInviteCreate.mockResolvedValue({ _id: 'i5' });
        const res = mkRes();
        await createInvite({ user: { id: 'c1', role: 'client', displayName: 'A' }, body: { toUserId: 'ghost', toRole: 'artist', note: 'Loved your reel' } } as any, res, jest.fn());
        expect(mockInviteCreate).toHaveBeenCalledWith(expect.objectContaining({ toUserId: 'ghost', toSnapshot: undefined }));
        expect(res.status).toHaveBeenCalledWith(201);
    });

    it('agency invite: 201 when the recipient is a genuine agency', async () => {
        mockOrganizerCategory.mockResolvedValue('agency');
        mockInviteCreate.mockResolvedValue({ _id: 'i3' });
        const res = mkRes();
        await createInvite({ user: { id: 'c1', role: 'client', displayName: 'A' }, body: { toUserId: 'ag1', toRole: 'agency', note: 'Pitch for our sangeet' } } as any, res, jest.fn());
        expect(mockOrganizerCategory).toHaveBeenCalledWith('ag1');
        expect(mockInviteCreate).toHaveBeenCalledWith(expect.objectContaining({ toUserId: 'ag1', toRole: 'agency', status: 'sent' }));
        expect(res.status).toHaveBeenCalledWith(201);
    });

    it('agency invite: 400 when the recipient is not an agency (individual)', async () => {
        mockOrganizerCategory.mockResolvedValue('individual');
        const res = mkRes();
        await createInvite({ user: { id: 'c1', role: 'client', displayName: 'A' }, body: { toUserId: 'ag1', toRole: 'agency', note: 'Pitch for our sangeet' } } as any, res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ meta: expect.objectContaining({ message: 'Recipient is not an agency' }) }));
        expect(mockInviteCreate).not.toHaveBeenCalled();
    });

    it('agency invite: 400 when the recipient has no organizer (undefined category)', async () => {
        mockOrganizerCategory.mockResolvedValue(undefined);
        const res = mkRes();
        await createInvite({ user: { id: 'c1', role: 'client', displayName: 'A' }, body: { toUserId: 'ag1', toRole: 'agency', note: 'Pitch for our sangeet' } } as any, res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ meta: expect.objectContaining({ message: 'Recipient is not an agency' }) }));
        expect(mockInviteCreate).not.toHaveBeenCalled();
    });

    it('409s on a duplicate context-free invite with a person-scoped message', async () => {
        mockInviteCreate.mockRejectedValue({ code: 11000 });
        const res = mkRes();
        await createInvite({ user: { id: 'c1', role: 'client', displayName: 'A' }, body: { toUserId: 'a1', toRole: 'artist', note: 'hi there welcome' } } as any, res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(409);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ meta: expect.objectContaining({ message: "You've already invited this person." }) }));
    });

    it('409s on a duplicate requirement-attached invite with a requirement-scoped message', async () => {
        mockReqFindById.mockResolvedValue({ _id: 'r1', clientId: 'c1', status: 'open', title: 'Sangeet' });
        mockInviteCreate.mockRejectedValue({ code: 11000 });
        const res = mkRes();
        await createInvite({ user: { id: 'c1', role: 'client', displayName: 'A' }, body: { toUserId: 'a1', toRole: 'artist', requirementId: 'r1' } } as any, res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(409);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ meta: expect.objectContaining({ message: "You've already invited them to this requirement." }) }));
    });
});

describe('getReceivedInvites', () => {
    it('lists invites where I am the recipient, newest first', async () => {
        const sorted = { sort: jest.fn().mockResolvedValue([{ _id: 'i1' }]) };
        mockInviteFind.mockReturnValue(sorted);
        const res = mkRes();
        await getReceivedInvites({ user: { id: 'a1', role: 'artist' } } as any, res, jest.fn());
        expect(mockInviteFind).toHaveBeenCalledWith({ toUserId: 'a1' });
        expect(res.status).toHaveBeenCalledWith(200);
    });
});

describe('getSentInvites', () => {
    it('lists invites the client sent, newest first, carrying the recipient snapshot', async () => {
        const sorted = { sort: jest.fn().mockResolvedValue([{ _id: 'i1', toSnapshot: { displayName: 'Ravi Kumar' } }]) };
        mockInviteFind.mockReturnValue(sorted);
        const res = mkRes();
        await getSentInvites({ user: { id: 'c1', role: 'client' } } as any, res, jest.fn());
        expect(mockInviteFind).toHaveBeenCalledWith({ fromClientId: 'c1' });
        expect(sorted.sort).toHaveBeenCalledWith({ createdAt: -1 });
        expect(res.status).toHaveBeenCalledWith(200);
    });
});

describe('respondToInvite', () => {
    beforeEach(() => mockInviteFindById.mockReset());
    const invite = (over: any = {}) => ({ _id: 'i1', toUserId: 'a1', status: 'sent', timeline: [], save: jest.fn().mockResolvedValue(undefined), ...over });

    it('403s when responder is not the recipient', async () => {
        mockInviteFindById.mockResolvedValue(invite({ toUserId: 'OTHER' }));
        const res = mkRes();
        await respondToInvite({ user: { id: 'a1', role: 'artist' }, params: { id: 'i1' }, body: { action: 'accept' } } as any, res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(403);
    });

    it('recipient accepts -> status accepted', async () => {
        const inv = invite();
        mockInviteFindById.mockResolvedValue(inv);
        const res = mkRes();
        await respondToInvite({ user: { id: 'a1', role: 'artist' }, params: { id: 'i1' }, body: { action: 'accept' } } as any, res, jest.fn());
        expect(inv.status).toBe('accepted');
        expect(res.status).toHaveBeenCalledWith(200);
    });

    it('400s on an invalid action', async () => {
        mockInviteFindById.mockResolvedValue(invite());
        const res = mkRes();
        await respondToInvite({ user: { id: 'a1', role: 'artist' }, params: { id: 'i1' }, body: { action: 'foo' } } as any, res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(400);
    });
});

describe('withdrawInvite', () => {
    beforeEach(() => mockInviteFindById.mockReset());
    const invite = (over: any = {}) => ({ _id: 'i1', fromClientId: 'c1', status: 'sent', save: jest.fn().mockResolvedValue(undefined), ...over });

    it('404s when the invite does not exist', async () => {
        mockInviteFindById.mockResolvedValue(null);
        const res = mkRes();
        await withdrawInvite({ user: { id: 'c1', role: 'client' }, params: { id: 'i1' } } as any, res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(404);
    });

    it('403s when the requester is not the sender', async () => {
        mockInviteFindById.mockResolvedValue(invite({ fromClientId: 'OTHER' }));
        const res = mkRes();
        await withdrawInvite({ user: { id: 'c1', role: 'client' }, params: { id: 'i1' } } as any, res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(403);
    });

    it('sender withdraws a sent invite -> status withdrawn', async () => {
        const inv = invite();
        mockInviteFindById.mockResolvedValue(inv);
        const res = mkRes();
        await withdrawInvite({ user: { id: 'c1', role: 'client' }, params: { id: 'i1' } } as any, res, jest.fn());
        expect(inv.status).toBe('withdrawn');
        expect(inv.save).toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(200);
    });

    it('400s when trying to withdraw an already-accepted invite', async () => {
        mockInviteFindById.mockResolvedValue(invite({ status: 'accepted' }));
        const res = mkRes();
        await withdrawInvite({ user: { id: 'c1', role: 'client' }, params: { id: 'i1' } } as any, res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(400);
    });
});
