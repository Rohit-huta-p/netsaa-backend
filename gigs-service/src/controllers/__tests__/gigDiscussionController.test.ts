// src/controllers/__tests__/gigDiscussionController.test.ts
//
// Unit tests for gig discussion threading (parentId resolution). Follows the
// house pattern: mock the Mongoose models + the socket emitter, call the
// controller with a fake req/res, assert on what reaches GigComment.create.
// No DB — mongoose stays real only so ObjectId.isValid() runs for real.

const mockGigFindById = jest.fn();
const mockCommentFindOne = jest.fn();
const mockCommentCreate = jest.fn();
const mockUserFindById = jest.fn();
const mockEmit = jest.fn();
const mockTo = jest.fn(() => ({ emit: mockEmit }));

// The controller opens a Redis connection + socket emitter at module load — stub
// both so importing it never touches a real Redis.
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
        create: (...a: any[]) => mockCommentCreate(...a),
    },
}));
jest.mock('../../models/User', () => ({
    __esModule: true,
    default: { findById: (...a: any[]) => mockUserFindById(...a) },
}));

import { addGigComment } from '../gigDiscussionController';

const GIG = 'c3c3c3c3c3c3c3c3c3c3c3c3';
const ROOT = 'a1a1a1a1a1a1a1a1a1a1a1a1';
const REPLY = 'b2b2b2b2b2b2b2b2b2b2b2b2';

const mkRes = () => {
    const res: any = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
};
const mkReq = (body: any) => ({ body, params: { gigId: GIG }, user: { id: 'u1' } } as any);

beforeEach(() => {
    jest.clearAllMocks();
    mockGigFindById.mockResolvedValue({ status: 'published' });
    mockUserFindById.mockReturnValue({ select: () => ({ lean: () => Promise.resolve({ displayName: 'Asker' }) }) });
    mockCommentCreate.mockImplementation((doc: any) => Promise.resolve({ _id: 'new-id', ...doc }));
});

describe('addGigComment — threading', () => {
    it('stores parentId = null for a top-level comment', async () => {
        const res = mkRes();
        await addGigComment(mkReq({ text: 'A question' }), res);
        expect(mockCommentFindOne).not.toHaveBeenCalled();
        expect(mockCommentCreate).toHaveBeenCalledWith(
            expect.objectContaining({ parentId: null, collectionType: 'gig', topicId: GIG }),
        );
        expect(res.status).toHaveBeenCalledWith(201);
    });

    it('stores parentId = root id when replying to a top-level comment', async () => {
        mockCommentFindOne.mockResolvedValue({ _id: ROOT, parentId: null });
        const res = mkRes();
        await addGigComment(mkReq({ text: 'A reply', parentId: ROOT }), res);
        expect(mockCommentFindOne).toHaveBeenCalledWith(
            expect.objectContaining({ _id: ROOT, topicId: GIG, collectionType: 'gig' }),
        );
        expect(mockCommentCreate).toHaveBeenCalledWith(expect.objectContaining({ parentId: ROOT }));
        expect(res.status).toHaveBeenCalledWith(201);
    });

    it('coerces a reply-to-a-reply onto the thread root (one level only)', async () => {
        // Parent is itself a reply (parentId = ROOT); the new reply must attach to
        // ROOT, never to REPLY — this is the one-level guarantee.
        mockCommentFindOne.mockResolvedValue({ _id: REPLY, parentId: ROOT });
        const res = mkRes();
        await addGigComment(mkReq({ text: 'nested', parentId: REPLY }), res);
        expect(mockCommentCreate).toHaveBeenCalledWith(expect.objectContaining({ parentId: ROOT }));
    });

    it('rejects an invalid parentId (never creates the comment)', async () => {
        const res = mkRes();
        await addGigComment(mkReq({ text: 'x', parentId: 'not-an-id' }), res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(mockCommentCreate).not.toHaveBeenCalled();
    });

    it('rejects a parentId that is not a comment on this gig', async () => {
        mockCommentFindOne.mockResolvedValue(null);
        const res = mkRes();
        await addGigComment(mkReq({ text: 'x', parentId: ROOT }), res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(mockCommentCreate).not.toHaveBeenCalled();
    });
});
