import { sweepStalePending } from '../workers/stalePendingCleanup.worker';
import EventRegistration from '../models/EventRegistration';
import { releaseSpots } from '../services/capacity.service';

jest.mock('../models/EventRegistration');
jest.mock('../services/capacity.service');

describe('sweepStalePending', () => {
    beforeEach(() => jest.clearAllMocks());

    it('flips pending registrations older than 15min to cancelled + releases seats', async () => {
        (EventRegistration.find as jest.Mock).mockReturnValue({
            select: jest.fn().mockReturnValue({
                lean: jest.fn().mockResolvedValue([
                    { _id: 'r1', eventId: 'e1', attendeeCount: 2 },
                    { _id: 'r2', eventId: 'e2', attendeeCount: 1 },
                ]),
            }),
        });
        (EventRegistration.updateMany as jest.Mock).mockResolvedValue({ modifiedCount: 2 });

        const result = await sweepStalePending();

        expect(result.cancelled).toBe(2);
        expect(result.seatsReleased).toBe(3);
        expect(releaseSpots).toHaveBeenCalledWith('e1', 2);
        expect(releaseSpots).toHaveBeenCalledWith('e2', 1);
    });

    it('returns 0 when no stale rows', async () => {
        (EventRegistration.find as jest.Mock).mockReturnValue({
            select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }),
        });
        const result = await sweepStalePending();
        expect(result.cancelled).toBe(0);
        expect(releaseSpots).not.toHaveBeenCalled();
    });

    it('queries with paymentStatus=pending + status=pending_payment + createdAt cutoff', async () => {
        (EventRegistration.find as jest.Mock).mockReturnValue({
            select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }),
        });
        await sweepStalePending();
        expect(EventRegistration.find).toHaveBeenCalledWith(
            expect.objectContaining({
                paymentStatus: 'pending',
                status: 'pending_payment',
                createdAt: { $lt: expect.any(Date) },
            })
        );
    });
});
