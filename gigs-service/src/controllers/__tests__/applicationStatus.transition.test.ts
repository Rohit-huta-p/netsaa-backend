// src/controllers/__tests__/applicationStatus.transition.test.ts
//
// Reversible "Pass": updateApplicationStatus now allows rejected -> applied so
// the owner hub can Undo a pass and return the applicant to the pool. The other
// transitions stay as before — reject -> shortlisted/hired is still invalid, and
// 'hired' stays terminal (revoking a hire is a dedicated cascade, not this plain
// transition). House pattern: mock the models + the mongoose transaction session,
// leave the pure response helper and role utils running.

const mockAppFindById = jest.fn();
const mockGigFindById = jest.fn();
const mockStatsFOU = jest.fn().mockResolvedValue({});
const mockEmitStatusChanged = jest.fn();

jest.mock('../../models/Gig', () => ({ __esModule: true, default: { findById: (...a: any[]) => mockGigFindById(...a) } }));
jest.mock('../../models/GigStats', () => ({ __esModule: true, default: { findOneAndUpdate: (...a: any[]) => mockStatsFOU(...a) } }));
jest.mock('../../models/GigApplication', () => ({ __esModule: true, default: { findById: (...a: any[]) => mockAppFindById(...a) } }));
jest.mock('../../models/SavedGig', () => ({ __esModule: true, default: {} }));
jest.mock('../../notifications/event.emitter', () => ({
    notificationEvents: {
        emitGigApplicationStatusChanged: (...a: any[]) => mockEmitStatusChanged(...a),
        emitGigApplicationReceived: jest.fn(),
        emitGigCancelled: jest.fn(),
    },
}));
jest.mock('../../utils/geocode', () => ({ geocodeLocation: jest.fn() }));

import mongoose from 'mongoose';
import { updateApplicationStatus } from '../gigController';

const mkRes = () => {
    const res: any = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
};
const mkReq = (applicationId: string, status: string, userId = 'owner1') =>
    ({ params: { applicationId }, body: { status }, user: { id: userId } } as any);

// Fake mongoose transaction session — the controller only drives the four
// lifecycle methods; none of them touch a real connection here.
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

beforeEach(() => {
    jest.clearAllMocks();
    session.commitTransaction.mockResolvedValue(undefined);
    session.abortTransaction.mockResolvedValue(undefined);
    jest.spyOn(mongoose, 'startSession').mockReturnValue(session as any);
    // Owner matches req.user.id so authorization passes; each test sets the app.
    mockGigFindById.mockReturnValue({
        session: () => Promise.resolve({ _id: 'g1', organizerId: 'owner1', title: 'Sangeet night' }),
    });
});

describe('updateApplicationStatus — reversible Pass', () => {
    it('allows rejected -> applied: saves, commits, emits, and touches no stat', async () => {
        const app = makeApp('rejected');
        mockAppFindById.mockReturnValue({ session: () => Promise.resolve(app) });

        const res = mkRes();
        await updateApplicationStatus(mkReq('a1', 'applied'), res, jest.fn());

        expect(app.status).toBe('applied');
        expect(app.save).toHaveBeenCalled();
        expect(session.commitTransaction).toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(200);
        // 'applied' is not a counted stat, so GigStats is never written.
        expect(mockStatsFOU).not.toHaveBeenCalled();
        expect(mockEmitStatusChanged).toHaveBeenCalledWith(
            expect.objectContaining({ oldStatus: 'rejected', newStatus: 'applied' })
        );
    });

    it('still blocks rejected -> hired (400, aborts, no save)', async () => {
        const app = makeApp('rejected');
        mockAppFindById.mockReturnValue({ session: () => Promise.resolve(app) });

        const res = mkRes();
        await updateApplicationStatus(mkReq('a1', 'hired'), res, jest.fn());

        expect(res.status).toHaveBeenCalledWith(400);
        expect(app.save).not.toHaveBeenCalled();
        expect(session.abortTransaction).toHaveBeenCalled();
    });

    it('keeps hired terminal — hired -> shortlisted stays 400', async () => {
        const app = makeApp('hired');
        mockAppFindById.mockReturnValue({ session: () => Promise.resolve(app) });

        const res = mkRes();
        await updateApplicationStatus(mkReq('a1', 'shortlisted'), res, jest.fn());

        expect(res.status).toHaveBeenCalledWith(400);
        expect(app.save).not.toHaveBeenCalled();
    });

    it('still allows the forward path applied -> shortlisted (regression guard)', async () => {
        const app = makeApp('applied');
        mockAppFindById.mockReturnValue({ session: () => Promise.resolve(app) });

        const res = mkRes();
        await updateApplicationStatus(mkReq('a1', 'shortlisted'), res, jest.fn());

        expect(app.status).toBe('shortlisted');
        expect(res.status).toHaveBeenCalledWith(200);
        expect(mockStatsFOU).toHaveBeenCalled(); // shortlisted IS a counted stat
    });
});
