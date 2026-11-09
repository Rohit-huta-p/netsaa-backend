// src/tests/follows.service.test.ts
//
// FollowsService: follow is idempotent + race-safe (upsert; a duplicate-key
// 11000 is swallowed, a real error propagates) and emits follow.started ONLY on
// a genuinely new follow; unfollow is idempotent; getStatus reports isFollowing
// + the followee's follower count; getFollowerIds lists follower ids for fan-out.
// Self-follow is a 400 FollowError (carries the status for the controller).

const mockUpdateOne = jest.fn();
const mockDeleteOne = jest.fn();
const mockCountDocuments = jest.fn();
const mockFindOne = jest.fn();
const mockFind = jest.fn();
const mockEmitFollowStarted = jest.fn();

jest.mock('../follows/follows.model', () => ({
    __esModule: true,
    default: {
        updateOne: (...a: any[]) => mockUpdateOne(...a),
        deleteOne: (...a: any[]) => mockDeleteOne(...a),
        countDocuments: (...a: any[]) => mockCountDocuments(...a),
        findOne: (...a: any[]) => mockFindOne(...a),
        find: (...a: any[]) => mockFind(...a),
    },
}));
jest.mock('../notifications', () => ({
    notificationEvents: { emitFollowStarted: (...a: any[]) => mockEmitFollowStarted(...a) },
}));

import followsService from '../follows/follows.service';
import { FollowError } from '../follows/follows.errors';

const ME = 'user-me';
const ORG = 'org-1';

beforeEach(() => jest.clearAllMocks());

describe('FollowsService', () => {
    it('400 FollowError when following yourself', async () => {
        await expect(followsService.follow(ME, ME)).rejects.toBeInstanceOf(FollowError);
        await expect(followsService.follow(ME, ME)).rejects.toMatchObject({ status: 400 });
        expect(mockUpdateOne).not.toHaveBeenCalled();
    });

    it('follow: upserts the pair, returns state, and notifies the followee on a NEW follow', async () => {
        mockUpdateOne.mockResolvedValue({ upsertedCount: 1 });
        mockCountDocuments.mockResolvedValue(42);
        const state = await followsService.follow(ME, ORG);
        expect(mockUpdateOne).toHaveBeenCalledWith(
            { followerId: ME, followeeId: ORG },
            { $setOnInsert: { followerId: ME, followeeId: ORG } },
            { upsert: true },
        );
        expect(state).toEqual({ isFollowing: true, followerCount: 42 });
        expect(mockEmitFollowStarted).toHaveBeenCalledWith({ recipientId: ORG, actorId: ME });
    });

    it('follow is idempotent: a re-follow (no upsert) does NOT notify', async () => {
        mockUpdateOne.mockResolvedValue({ upsertedCount: 0 });
        mockCountDocuments.mockResolvedValue(42);
        await expect(followsService.follow(ME, ORG)).resolves.toEqual({ isFollowing: true, followerCount: 42 });
        expect(mockEmitFollowStarted).not.toHaveBeenCalled();
    });

    it('follow is idempotent: a duplicate-key race (11000) resolves as following and does NOT notify', async () => {
        mockUpdateOne.mockRejectedValue({ code: 11000 });
        mockCountDocuments.mockResolvedValue(7);
        await expect(followsService.follow(ME, ORG)).resolves.toEqual({ isFollowing: true, followerCount: 7 });
        expect(mockEmitFollowStarted).not.toHaveBeenCalled();
    });

    it('follow rethrows a non-duplicate error', async () => {
        mockUpdateOne.mockRejectedValue({ code: 121, message: 'validation' });
        await expect(followsService.follow(ME, ORG)).rejects.toMatchObject({ code: 121 });
    });

    it('unfollow: deletes the pair and returns isFollowing false + count', async () => {
        mockDeleteOne.mockResolvedValue({ deletedCount: 1 });
        mockCountDocuments.mockResolvedValue(41);
        const state = await followsService.unfollow(ME, ORG);
        expect(mockDeleteOne).toHaveBeenCalledWith({ followerId: ME, followeeId: ORG });
        expect(state).toEqual({ isFollowing: false, followerCount: 41 });
    });

    it('getStatus: following → isFollowing true + count', async () => {
        mockFindOne.mockReturnValue({ lean: () => Promise.resolve({ _id: 'f1' }) });
        mockCountDocuments.mockResolvedValue(9);
        await expect(followsService.getStatus(ME, ORG)).resolves.toEqual({ isFollowing: true, followerCount: 9 });
    });

    it('getStatus: not following → isFollowing false', async () => {
        mockFindOne.mockReturnValue({ lean: () => Promise.resolve(null) });
        mockCountDocuments.mockResolvedValue(9);
        await expect(followsService.getStatus(ME, ORG)).resolves.toEqual({ isFollowing: false, followerCount: 9 });
    });

    it('getFollowerIds: returns the followee\'s follower ids as strings', async () => {
        mockFind.mockReturnValue({
            select: () => ({ lean: () => Promise.resolve([{ followerId: 'a' }, { followerId: 'b' }]) }),
        });
        await expect(followsService.getFollowerIds(ORG)).resolves.toEqual(['a', 'b']);
        expect(mockFind).toHaveBeenCalledWith({ followeeId: ORG });
    });
});
