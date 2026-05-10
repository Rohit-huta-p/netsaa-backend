import {
    submitTag,
    approveTag,
    blockTag,
    incrementTagUsage,
    listPendingTags,
    listSuggestionTags,
} from '../services/tagGovernance.service';
import EventTag from '../models/EventTag';

jest.mock('../models/EventTag');

const ADMIN_ID = '507f1f77bcf86cd799439011';
const HIRER_ID = '507f1f77bcf86cd799439012';

describe('tagGovernance.service', () => {
    describe('submitTag', () => {
        it('creates new tag in pending status', async () => {
            (EventTag.findById as jest.Mock).mockResolvedValue(null);
            (EventTag.create as jest.Mock).mockResolvedValue({
                _id: 'masterclass',
                status: 'pending',
            });

            const r = await submitTag('Masterclass', HIRER_ID);
            expect(r.created).toBe(true);
            expect(r.normalizedId).toBe('masterclass');
            expect(EventTag.create).toHaveBeenCalledWith(expect.objectContaining({
                _id: 'masterclass',
                displayName: 'Masterclass',
                status: 'pending',
                createdBy: HIRER_ID,
            }));
        });

        it('returns existing tag without creating dup', async () => {
            (EventTag.findById as jest.Mock).mockResolvedValue({
                _id: 'workshop',
                status: 'seed',
                displayName: 'Workshop',
            });

            const r = await submitTag('Workshop', HIRER_ID);
            expect(r.created).toBe(false);
            expect(r.normalizedId).toBe('workshop');
            expect(EventTag.create).not.toHaveBeenCalled();
        });

        it('rejects invalid normalized id (empty after normalization)', async () => {
            await expect(submitTag('!!!', HIRER_ID)).rejects.toThrow(/INVALID/);
        });

        it('rejects tags >30 chars after normalization', async () => {
            (EventTag.findById as jest.Mock).mockResolvedValue(null);
            (EventTag.create as jest.Mock).mockResolvedValue({
                _id: 'a'.repeat(30),
                status: 'pending',
            });
            const long = 'a'.repeat(35);
            const r = await submitTag(long, HIRER_ID);
            expect(r.normalizedId).toHaveLength(30);
        });
    });

    describe('approveTag', () => {
        it('flips pending → approved with admin attribution', async () => {
            (EventTag.findByIdAndUpdate as jest.Mock).mockResolvedValue({
                _id: 'masterclass',
                status: 'approved',
            });

            await approveTag('masterclass', ADMIN_ID);
            expect(EventTag.findByIdAndUpdate).toHaveBeenCalledWith(
                'masterclass',
                expect.objectContaining({
                    status: 'approved',
                    approvedAt: expect.any(Date),
                    approvedBy: ADMIN_ID,
                })
            );
        });
    });

    describe('blockTag', () => {
        it('flips to blocked', async () => {
            (EventTag.findByIdAndUpdate as jest.Mock).mockResolvedValue({
                _id: 'spam',
                status: 'blocked',
            });
            await blockTag('spam', ADMIN_ID);
            expect(EventTag.findByIdAndUpdate).toHaveBeenCalledWith(
                'spam',
                expect.objectContaining({ status: 'blocked' })
            );
        });
    });

    describe('incrementTagUsage', () => {
        it('increments usageCount on each event publish', async () => {
            (EventTag.findByIdAndUpdate as jest.Mock).mockResolvedValue({
                _id: 'masterclass',
                usageCount: 4,
                status: 'approved',
            });

            await incrementTagUsage(['masterclass']);
            expect(EventTag.findByIdAndUpdate).toHaveBeenCalledWith(
                'masterclass',
                { $inc: { usageCount: 1 } },
                { new: true }
            );
        });

        it('handles multiple tags in parallel', async () => {
            (EventTag.findByIdAndUpdate as jest.Mock).mockResolvedValue({
                status: 'approved',
                usageCount: 2,
            });
            await incrementTagUsage(['workshop', 'audition', 'theatre']);
            expect(EventTag.findByIdAndUpdate).toHaveBeenCalledTimes(3);
        });
    });

    describe('listSuggestionTags', () => {
        it('returns approved + seed tags ordered by usageCount desc', async () => {
            const mockExec = jest.fn().mockResolvedValue([
                { _id: 'workshop', displayName: 'Workshop', usageCount: 147 },
                { _id: 'audition', displayName: 'Audition', usageCount: 89 },
            ]);
            (EventTag.find as jest.Mock).mockReturnValue({
                sort: jest.fn().mockReturnValue({
                    limit: jest.fn().mockReturnValue({
                        lean: mockExec,
                    }),
                }),
            });

            const tags = await listSuggestionTags(20);
            expect(tags).toHaveLength(2);
            expect(EventTag.find).toHaveBeenCalledWith({ status: { $in: ['seed', 'approved'] } });
        });
    });
});
