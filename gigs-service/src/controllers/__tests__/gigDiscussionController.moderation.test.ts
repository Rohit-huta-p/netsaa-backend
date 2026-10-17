// src/controllers/__tests__/gigDiscussionController.moderation.test.ts
//
// Unit tests for the net-new discussion moderation + post-eligibility guard
// (pin/unpin with a cap, soft-delete, and the canApply||owner POST guard).
// Same house pattern as gigDiscussionController.test.ts: mock the Mongoose
// models + socket emitter, drive the controller with a fake req/res. The real
// roleVisibility util is left unmocked so canApply/normalizeRole run for real.

const mockGigFindById = jest.fn();
const mockCommentFindOne = jest.fn();
const mockCommentFind = jest.fn();
const mockCommentCreate = jest.fn();
const mockUserFindById = jest.fn();
const mockEmit = jest.fn();
const mockTo = jest.fn(() => ({ emit: mockEmit }));

jest.mock('ioredis', () => ({
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({ on: jest.fn(), quit: jest.fn() })),
}));
jest.mock('@socket.io/redis-emitter', () => ({
    __esModule: true,
    Emitter: jest.fn().mockImplementation(() => ({ to: mockTo })),
}));
jest.mock('../../models/Gig', () => ({
    __esModule: true,
    default: { findById: (...a: any[]) => mockGigFindById(...a) },
}));
jest.mock('../../models/GigComment', () => ({
    __esModule: true,
    default: {
        findOne: (...a: any[]) => mockCommentFindOne(...a),
        find: (...a: any[]) => mockCommentFind(...a),
        create: (...a: any[]) => mockCommentCreate(...a),
    },
}));
jest.mock('../../models/User', () => ({
    __esModule: true,
    default: { findById: (...a: any[]) => mockUserFindById(...a) },
}));

import { addGigComment, togglePinGigComment, deleteGigComment } from '../gigDiscussionController';

const GIG = 'c3c3c3c3c3c3c3c3c3c3c3c3';
const CID = 'd4d4d4d4d4d4d4d4d4d4d4d4';
const OWNER = 'owner1';

const mkRes = () => {
    const res: any = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
};
const mkReq = ({ body = {}, user = { id: 'u1' }, commentId = CID }: any = {}) =>
    ({ params: { gigId: GIG, commentId }, body, user } as any);
const mkComment = (over: any = {}) => ({
    _id: CID,
    authorId: 'author',
    isPinned: false,
    isDeleted: false,
    pinnedAt: undefined,
    pinnedBy: undefined,
    text: 'hi',
    save: jest.fn().mockResolvedValue(undefined),
    ...over,
});

beforeEach(() => {
    jest.clearAllMocks();
    // Defaults so unrelated paths never explode.
    mockUserFindById.mockReturnValue({ select: () => ({ lean: () => Promise.resolve({ displayName: 'Asker' }) }) });
    mockCommentCreate.mockImplementation((doc: any) => Promise.resolve({ _id: 'new-id', ...doc }));
    mockCommentFind.mockReturnValue({ sort: () => Promise.resolve([]) });
});

describe('addGigComment — post-eligibility guard', () => {
    it('blocks an ineligible role (artist on a client gig) with 403, never creates', async () => {
        mockGigFindById.mockResolvedValue({ status: 'published', organizerId: OWNER, posterRole: 'client' });
        const res = mkRes();
        await addGigComment(mkReq({ body: { text: 'q' }, user: { id: 'u1', role: 'artist' } }), res);
        expect(res.status).toHaveBeenCalledWith(403);
        expect(mockCommentCreate).not.toHaveBeenCalled();
    });

    it('allows an eligible role (creative_lead on a client gig)', async () => {
        mockGigFindById.mockResolvedValue({ status: 'published', organizerId: OWNER, posterRole: 'client' });
        const res = mkRes();
        await addGigComment(mkReq({ body: { text: 'q' }, user: { id: 'u2', role: 'creative_lead' } }), res);
        expect(res.status).toHaveBeenCalledWith(201);
        expect(mockCommentCreate).toHaveBeenCalled();
    });

    it('allows the gig owner even when their role could not apply', async () => {
        // Owner is a client posting a client gig — canApply(client, client) is
        // false, but the owner must always be able to answer their own thread.
        mockGigFindById.mockResolvedValue({ status: 'published', organizerId: 'u1', posterRole: 'client' });
        const res = mkRes();
        await addGigComment(mkReq({ body: { text: 'reply' }, user: { id: 'u1', role: 'client' } }), res);
        expect(res.status).toHaveBeenCalledWith(201);
    });
});

describe('togglePinGigComment', () => {
    it('rejects a non-owner with 403', async () => {
        mockGigFindById.mockResolvedValue({ organizerId: OWNER });
        const res = mkRes();
        await togglePinGigComment(mkReq({ user: { id: 'not-owner' } }), res);
        expect(res.status).toHaveBeenCalledWith(403);
        expect(mockCommentFindOne).not.toHaveBeenCalled();
    });

    it('pins an unpinned comment under the cap and emits discussion:pin', async () => {
        mockGigFindById.mockResolvedValue({ organizerId: 'u1' });
        const comment = mkComment({ isPinned: false });
        mockCommentFindOne.mockResolvedValue(comment);
        const res = mkRes();
        await togglePinGigComment(mkReq({ user: { id: 'u1' } }), res);
        expect(comment.isPinned).toBe(true);
        expect(comment.save).toHaveBeenCalled();
        expect(mockEmit).toHaveBeenCalledWith('discussion:pin', expect.objectContaining({ _id: CID, isPinned: true }));
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('unpins the oldest when already at the cap of 3', async () => {
        mockGigFindById.mockResolvedValue({ organizerId: 'u1' });
        const target = mkComment({ _id: CID, isPinned: false });
        mockCommentFindOne.mockResolvedValue(target);
        const oldest = mkComment({ _id: 'old', isPinned: true });
        const p2 = mkComment({ _id: 'p2', isPinned: true });
        const p3 = mkComment({ _id: 'p3', isPinned: true });
        mockCommentFind.mockReturnValue({ sort: () => Promise.resolve([oldest, p2, p3]) });
        const res = mkRes();
        await togglePinGigComment(mkReq({ user: { id: 'u1' } }), res);
        expect(oldest.isPinned).toBe(false);
        expect(oldest.save).toHaveBeenCalled();
        expect(target.isPinned).toBe(true);
        expect(mockEmit).toHaveBeenCalledWith('discussion:pin', expect.objectContaining({ _id: 'old', isPinned: false }));
        expect(mockEmit).toHaveBeenCalledWith('discussion:pin', expect.objectContaining({ _id: CID, isPinned: true }));
    });
});

describe('deleteGigComment', () => {
    it('lets the author soft-delete (reason self) and emits discussion:delete', async () => {
        mockGigFindById.mockResolvedValue({ organizerId: OWNER });
        const comment = mkComment({ authorId: 'u1', isDeleted: false });
        mockCommentFindOne.mockResolvedValue(comment);
        const res = mkRes();
        await deleteGigComment(mkReq({ user: { id: 'u1' } }), res);
        expect(comment.isDeleted).toBe(true);
        expect(comment.deletedReason).toBe('self');
        expect(comment.text).toBe('[deleted]');
        expect(mockEmit).toHaveBeenCalledWith('discussion:delete', expect.objectContaining({ _id: CID, isDeleted: true }));
    });

    it('lets the gig owner remove another user\'s comment (reason organizer)', async () => {
        mockGigFindById.mockResolvedValue({ organizerId: 'u1' });
        const comment = mkComment({ authorId: 'someone-else', isDeleted: false });
        mockCommentFindOne.mockResolvedValue(comment);
        const res = mkRes();
        await deleteGigComment(mkReq({ user: { id: 'u1' } }), res);
        expect(comment.deletedReason).toBe('organizer');
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('rejects a stranger (not author / owner / admin) with 403', async () => {
        mockGigFindById.mockResolvedValue({ organizerId: 'owner' });
        const comment = mkComment({ authorId: 'author', isDeleted: false });
        mockCommentFindOne.mockResolvedValue(comment);
        const res = mkRes();
        await deleteGigComment(mkReq({ user: { id: 'stranger', role: 'artist' } }), res);
        expect(res.status).toHaveBeenCalledWith(403);
        expect(comment.save).not.toHaveBeenCalled();
    });
});
