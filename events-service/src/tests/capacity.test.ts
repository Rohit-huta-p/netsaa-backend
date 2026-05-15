import { reserveSpot, releaseSpot, isCapacityAvailable } from '../services/capacity.service';
import Event from '../models/Event';
import mongoose from 'mongoose';

jest.mock('../models/Event');

describe('capacity.service', () => {
    const eventId = new mongoose.Types.ObjectId().toString();

    describe('reserveSpot', () => {
        it('returns ok=true when atomic increment succeeds', async () => {
            (Event.findOneAndUpdate as jest.Mock).mockResolvedValue({
                _id: eventId,
                capacity: { total: 50, registeredCount: 33 },
            });

            const result = await reserveSpot(eventId);
            expect(result.ok).toBe(true);
            if (result.ok) expect(result.event).toBeDefined();
            expect(Event.findOneAndUpdate).toHaveBeenCalledWith(
                expect.objectContaining({
                    _id: eventId,
                    status: 'live',
                    $expr: {
                        $gte: [
                            { $subtract: ['$capacity.total', '$capacity.registeredCount'] },
                            1,
                        ],
                    },
                }),
                { $inc: { 'capacity.registeredCount': 1 } },
                { new: true }
            );
        });

        it('returns ok=false reason=full when atomic returns null', async () => {
            (Event.findOneAndUpdate as jest.Mock).mockResolvedValue(null);

            const result = await reserveSpot(eventId);
            expect(result.ok).toBe(false);
            if (!result.ok) expect(result.reason).toBe('full_or_inactive');
        });
    });

    describe('releaseSpot (compensation)', () => {
        it('decrements registeredCount via $inc -1', async () => {
            (Event.findByIdAndUpdate as jest.Mock).mockResolvedValue({});

            await releaseSpot(eventId);
            expect(Event.findByIdAndUpdate).toHaveBeenCalledWith(
                eventId,
                { $inc: { 'capacity.registeredCount': -1 } }
            );
        });

        it('swallows release errors (best-effort, reconciliation will heal)', async () => {
            (Event.findByIdAndUpdate as jest.Mock).mockRejectedValue(new Error('mongo down'));
            await expect(releaseSpot(eventId)).resolves.not.toThrow();
        });
    });

    describe('isCapacityAvailable (read-only check)', () => {
        it('returns true when registeredCount < total', async () => {
            (Event.findById as jest.Mock).mockReturnValue({
                select: jest.fn().mockReturnValue({
                    lean: jest.fn().mockResolvedValue({
                        capacity: { total: 50, registeredCount: 32 },
                        status: 'live',
                    }),
                }),
            });
            const ok = await isCapacityAvailable(eventId);
            expect(ok).toBe(true);
        });

        it('returns false when full', async () => {
            (Event.findById as jest.Mock).mockReturnValue({
                select: jest.fn().mockReturnValue({
                    lean: jest.fn().mockResolvedValue({
                        capacity: { total: 50, registeredCount: 50 },
                        status: 'live',
                    }),
                }),
            });
            const ok = await isCapacityAvailable(eventId);
            expect(ok).toBe(false);
        });

        it('returns false when status != live', async () => {
            (Event.findById as jest.Mock).mockReturnValue({
                select: jest.fn().mockReturnValue({
                    lean: jest.fn().mockResolvedValue({
                        capacity: { total: 50, registeredCount: 0 },
                        status: 'cancelled',
                    }),
                }),
            });
            const ok = await isCapacityAvailable(eventId);
            expect(ok).toBe(false);
        });
    });
});
