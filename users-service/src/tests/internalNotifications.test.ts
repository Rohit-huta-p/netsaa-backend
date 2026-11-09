// src/tests/internalNotifications.test.ts
//
// The internal fan-out endpoint (POST /internal/notifications/followee-posted):
// resolve the poster's followers, then emit one followee.posted event per chunk.
// Validation, the no-followers no-op, chunked emission, and best-effort failure.

const mockGetFollowerIds = jest.fn();
const mockEmitFolloweePosted = jest.fn();

jest.mock('../follows/follows.service', () => ({
    __esModule: true,
    default: { getFollowerIds: (...a: any[]) => mockGetFollowerIds(...a) },
}));
jest.mock('../notifications', () => ({
    notificationEvents: { emitFolloweePosted: (...a: any[]) => mockEmitFolloweePosted(...a) },
}));

import { notifyFolloweePosted } from '../controllers/internalNotifications';

function mockRes() {
    const res: any = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
}

beforeEach(() => jest.clearAllMocks());

describe('notifyFolloweePosted (internal fan-out endpoint)', () => {
    it('400 when kind is invalid', async () => {
        const res = mockRes();
        await notifyFolloweePosted({ body: { organizerId: 'o1', kind: 'bad', entityId: 'e1' } } as any, res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(mockGetFollowerIds).not.toHaveBeenCalled();
    });

    it('400 when organizerId or entityId is missing', async () => {
        const res = mockRes();
        await notifyFolloweePosted({ body: { kind: 'gig', title: 'T' } } as any, res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(mockGetFollowerIds).not.toHaveBeenCalled();
    });

    it('200 notified:0 when the organizer has no followers (no emit)', async () => {
        mockGetFollowerIds.mockResolvedValue([]);
        const res = mockRes();
        await notifyFolloweePosted(
            { body: { organizerId: 'o1', kind: 'gig', entityId: 'g1', title: 'T' } } as any,
            res,
        );
        expect(mockGetFollowerIds).toHaveBeenCalledWith('o1');
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({ ok: true, notified: 0 });
        expect(mockEmitFolloweePosted).not.toHaveBeenCalled();
    });

    it('emits one followee.posted per 500-follower chunk and 202s', async () => {
        const followers = Array.from({ length: 1200 }, (_, i) => 'f' + i);
        mockGetFollowerIds.mockResolvedValue(followers);
        const res = mockRes();

        await notifyFolloweePosted(
            { body: { organizerId: 'o1', kind: 'gig', entityId: 'g1', title: 'Gig', actorName: 'Mehfil' } } as any,
            res,
        );

        expect(mockEmitFolloweePosted).toHaveBeenCalledTimes(3); // 1200 / 500 = 3 chunks
        const firstCall = mockEmitFolloweePosted.mock.calls[0][0];
        expect(firstCall).toMatchObject({
            actorId: 'o1',
            kind: 'gig',
            entityId: 'g1',
            title: 'Gig',
            actorName: 'Mehfil',
        });
        expect(firstCall.followerIds).toHaveLength(500);
        expect(mockEmitFolloweePosted.mock.calls[2][0].followerIds).toHaveLength(200);
        expect(res.status).toHaveBeenCalledWith(202);
        expect(res.json).toHaveBeenCalledWith({ ok: true, notified: 1200 });
    });

    it('500 (and no crash) when follower lookup throws — notifications are best-effort', async () => {
        mockGetFollowerIds.mockRejectedValue(new Error('db down'));
        const res = mockRes();
        await notifyFolloweePosted(
            { body: { organizerId: 'o1', kind: 'event', entityId: 'e1', title: 'E' } } as any,
            res,
        );
        expect(res.status).toHaveBeenCalledWith(500);
        expect(mockEmitFolloweePosted).not.toHaveBeenCalled();
    });
});
