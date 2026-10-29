// src/controllers/__tests__/gigManageToggles.b4.test.ts
//
// B4 — owner "Manage gig" (⋯) toggles:
//   • applicationsPaused — applyToGig rejects new applications (400) while paused,
//     without the gig being closed (status stays 'published').
//   • autoCloseWhenFilled — hiring the final slot flips the gig to 'closed' when
//     opted in (default on), and leaves it open when opted out or not yet full.
// House pattern (mirrors applicationStatus.transition.test.ts): mock the models +
// the mongoose transaction session, leave the pure helpers running.

const mockGigFindById = jest.fn();
const mockAppFindById = jest.fn();
const mockAppCount = jest.fn();
const mockAppFindOne = jest.fn();
const mockAppCreate = jest.fn();
const mockStatsFOU = jest.fn().mockResolvedValue({});
const mockUserFindById = jest.fn();
const mockEmitStatusChanged = jest.fn();
const mockEmitReceived = jest.fn();

jest.mock('../../models/Gig', () => ({ __esModule: true, default: { findById: (...a: any[]) => mockGigFindById(...a) } }));
jest.mock('../../models/GigApplication', () => ({
    __esModule: true,
    default: {
        findById: (...a: any[]) => mockAppFindById(...a),
        countDocuments: (...a: any[]) => mockAppCount(...a),
        findOne: (...a: any[]) => mockAppFindOne(...a),
        create: (...a: any[]) => mockAppCreate(...a),
    },
}));
jest.mock('../../models/GigStats', () => ({ __esModule: true, default: { findOneAndUpdate: (...a: any[]) => mockStatsFOU(...a) } }));
jest.mock('../../models/User', () => ({ __esModule: true, default: { findById: (...a: any[]) => mockUserFindById(...a) } }));
jest.mock('../../models/SavedGig', () => ({ __esModule: true, default: {} }));
jest.mock('../../notifications/event.emitter', () => ({
    notificationEvents: {
        emitGigApplicationStatusChanged: (...a: any[]) => mockEmitStatusChanged(...a),
        emitGigApplicationReceived: (...a: any[]) => mockEmitReceived(...a),
        emitGigCancelled: jest.fn(),
    },
}));
jest.mock('../../utils/geocode', () => ({ geocodeLocation: jest.fn() }));

import mongoose from 'mongoose';
import { applyToGig, updateApplicationStatus } from '../gigController';

const mkRes = () => {
    const res: any = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
};

const session = {
    startTransaction: jest.fn(),
    commitTransaction: jest.fn().mockResolvedValue(undefined),
    abortTransaction: jest.fn().mockResolvedValue(undefined),
    endSession: jest.fn(),
};

const makeApp = (status: string) => ({
    _id: 'a1', gigId: 'g1', artistId: 'u1', status,
    save: jest.fn().mockResolvedValue(undefined),
});
const makeGig = (over: any = {}) => ({
    _id: 'g1', organizerId: 'owner1', title: 'Sangeet night',
    status: 'published', applicationsPaused: false, autoCloseWhenFilled: true,
    headcount: 2,
    save: jest.fn().mockResolvedValue(undefined),
    ...over,
});
const useGig = (gig: any) => mockGigFindById.mockReturnValue({ session: () => Promise.resolve(gig) });
const useApp = (app: any) => mockAppFindById.mockReturnValue({ session: () => Promise.resolve(app) });
const useHiredCount = (n: number) => mockAppCount.mockReturnValue({ session: () => Promise.resolve(n) });

beforeEach(() => {
    jest.clearAllMocks();
    session.commitTransaction.mockResolvedValue(undefined);
    session.abortTransaction.mockResolvedValue(undefined);
    jest.spyOn(mongoose, 'startSession').mockReturnValue(session as any);
});

describe('applyToGig — applicationsPaused gate', () => {
    const mkApplyReq = () => ({ params: { id: 'g1' }, body: { coverNote: 'hi', portfolioLinks: [] }, user: { id: 'artist1', role: 'artist' } } as any);

    it('rejects a new application with 400 while paused, and never creates it', async () => {
        useGig(makeGig({ applicationsPaused: true }));

        const res = mkRes();
        await applyToGig(mkApplyReq(), res, jest.fn());

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            meta: expect.objectContaining({ message: 'Applications are paused for this gig' }),
        }));
        expect(mockAppCreate).not.toHaveBeenCalled();
        expect(session.abortTransaction).toHaveBeenCalled();
    });

    it('does not trip the pause gate when applications are open (falls through past it)', async () => {
        // Not paused + no existing application → the pause gate is skipped and the
        // flow proceeds (it later creates the application). We only assert the
        // pause message is NOT what came back.
        useGig(makeGig({ applicationsPaused: false, maxApplications: undefined, posterRole: 'creative_lead' }));
        mockAppFindOne.mockReturnValue({ session: () => Promise.resolve(null) });
        mockUserFindById.mockReturnValue({ select: () => ({ lean: () => Promise.resolve({ skills: [], cached: {} }) }) });
        mockAppCreate.mockResolvedValue([{ _id: 'newapp', toString: () => 'newapp' }]);
        mockStatsFOU.mockResolvedValue({});

        const res = mkRes();
        await applyToGig(mkApplyReq(), res, jest.fn());

        const msgs = res.json.mock.calls.map((c: any[]) => c[0]?.meta?.message);
        expect(msgs).not.toContain('Applications are paused for this gig');
    });
});

describe('updateApplicationStatus — autoCloseWhenFilled', () => {
    it('closes the gig when the final slot is hired (opted in)', async () => {
        useApp(makeApp('shortlisted'));
        const gig = makeGig({ status: 'published', autoCloseWhenFilled: true, headcount: 2 });
        useGig(gig);
        useHiredCount(2); // this hire fills 2 of 2

        const res = mkRes();
        await updateApplicationStatus({ params: { applicationId: 'a1' }, body: { status: 'hired' }, user: { id: 'owner1' } } as any, res, jest.fn());

        expect(res.status).toHaveBeenCalledWith(200);
        expect(gig.status).toBe('closed');
        expect(gig.save).toHaveBeenCalled();
    });

    it('leaves the gig open when auto-close is turned off, even when full', async () => {
        useApp(makeApp('shortlisted'));
        const gig = makeGig({ status: 'published', autoCloseWhenFilled: false, headcount: 2 });
        useGig(gig);
        useHiredCount(2);

        const res = mkRes();
        await updateApplicationStatus({ params: { applicationId: 'a1' }, body: { status: 'hired' }, user: { id: 'owner1' } } as any, res, jest.fn());

        expect(res.status).toHaveBeenCalledWith(200);
        expect(gig.status).toBe('published');
        expect(gig.save).not.toHaveBeenCalled();
    });

    it('leaves the gig open when slots are not yet filled', async () => {
        useApp(makeApp('shortlisted'));
        const gig = makeGig({ status: 'published', autoCloseWhenFilled: true, headcount: 4 });
        useGig(gig);
        useHiredCount(2); // 2 of 4 — still open

        const res = mkRes();
        await updateApplicationStatus({ params: { applicationId: 'a1' }, body: { status: 'hired' }, user: { id: 'owner1' } } as any, res, jest.fn());

        expect(res.status).toHaveBeenCalledWith(200);
        expect(gig.status).toBe('published');
        expect(gig.save).not.toHaveBeenCalled();
    });
});
