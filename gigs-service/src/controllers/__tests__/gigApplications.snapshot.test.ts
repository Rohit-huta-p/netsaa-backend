// src/controllers/__tests__/gigApplications.snapshot.test.ts
//
// B1 — getGigApplications lazily backfills location + specialities onto older
// snapshots from the User mirror, without overwriting values a newer snapshot
// already carries, and skips the lookup entirely when nothing needs filling.
// House pattern: mock the models, leave the real artistSnapshot util running.

const mockGigFindById = jest.fn();
const mockAppFind = jest.fn();
const mockUserFind = jest.fn();

jest.mock('../../models/Gig', () => ({ __esModule: true, default: { findById: (...a: any[]) => mockGigFindById(...a) } }));
jest.mock('../../models/GigStats', () => ({ __esModule: true, default: {} }));
jest.mock('../../models/GigApplication', () => ({ __esModule: true, default: { find: (...a: any[]) => mockAppFind(...a) } }));
jest.mock('../../models/SavedGig', () => ({ __esModule: true, default: {} }));
jest.mock('../../models/User', () => ({ __esModule: true, default: { find: (...a: any[]) => mockUserFind(...a) } }));
jest.mock('../../notifications/event.emitter', () => ({ notificationEvents: { emitGigApplicationReceived: jest.fn() } }));
jest.mock('../../utils/geocode', () => ({ geocodeLocation: jest.fn() }));

import { getGigApplications } from '../gigController';

const mkRes = () => {
    const res: any = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
};
const mkReq = (user: any = { id: 'owner1' }) => ({ params: { gigId: 'g1' }, user } as any);
const dataOf = (res: any) => res.json.mock.calls[0][0].data;

const appFindReturns = (apps: any[]) =>
    mockAppFind.mockReturnValue({ sort: () => ({ lean: () => Promise.resolve(apps) }) });
const userFindReturns = (users: any[]) =>
    mockUserFind.mockReturnValue({ select: () => ({ lean: () => Promise.resolve(users) }) });

beforeEach(() => {
    jest.clearAllMocks();
    mockGigFindById.mockResolvedValue({ organizerId: 'owner1' });
});

describe('getGigApplications — B1 snapshot backfill', () => {
    it('fills missing city/specialities from the mirror and preserves present ones', async () => {
        appFindReturns([
            { _id: 'a1', artistId: 'u1', artistSnapshot: { displayName: 'New', primaryCity: 'Pune', specialities: ['Kathak', 'Folk'] } },
            { _id: 'a2', artistId: 'u2', artistSnapshot: { displayName: 'Old' } },
            { _id: 'a3', artistId: 'u3', artistSnapshot: { displayName: 'Half', primaryCity: 'Mumbai' } },
        ]);
        userFindReturns([
            { _id: 'u2', cached: { primaryCity: 'Delhi' }, skills: ['Bharatanatyam', 'Contemporary', 'Jazz', 'Folk'] },
            { _id: 'u3', cached: { primaryCity: 'IGNORED' }, skills: ['Hip-hop', 'Bollywood'] },
        ]);

        const res = mkRes();
        await getGigApplications(mkReq(), res, jest.fn());
        const [a1, a2, a3] = dataOf(res);

        // a1 (complete) untouched
        expect(a1.artistSnapshot).toEqual({ displayName: 'New', primaryCity: 'Pune', specialities: ['Kathak', 'Folk'] });
        // a2 (missing both) filled — specialities capped at 3
        expect(a2.artistSnapshot.primaryCity).toBe('Delhi');
        expect(a2.artistSnapshot.specialities).toEqual(['Bharatanatyam', 'Contemporary', 'Jazz']);
        // a3 keeps its own city, only specialities filled
        expect(a3.artistSnapshot.primaryCity).toBe('Mumbai');
        expect(a3.artistSnapshot.specialities).toEqual(['Hip-hop', 'Bollywood']);
    });

    it('skips the User lookup entirely when every snapshot is complete', async () => {
        appFindReturns([
            { _id: 'a1', artistId: 'u1', artistSnapshot: { displayName: 'New', primaryCity: 'Pune', specialities: ['Kathak'] } },
        ]);
        const res = mkRes();
        await getGigApplications(mkReq(), res, jest.fn());
        expect(mockUserFind).not.toHaveBeenCalled();
    });

    it('403s when the requester is not the gig organizer', async () => {
        const res = mkRes();
        await getGigApplications(mkReq({ id: 'intruder' }), res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(403);
    });
});
