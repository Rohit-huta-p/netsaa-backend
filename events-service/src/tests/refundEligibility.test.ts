import { isRefundEligible, computeRefundAmount } from '../utils/refundEligibility';

const HOUR = 3600_000;

describe('isRefundEligible', () => {
    it('flex_24h: refunds if > 24h before event', () => {
        const startsAt = new Date(Date.now() + 30 * HOUR);
        expect(isRefundEligible({ refundPolicy: 'flex_24h' }, startsAt)).toBe(true);
    });

    it('flex_24h: rejects within 24h', () => {
        const startsAt = new Date(Date.now() + 12 * HOUR);
        expect(isRefundEligible({ refundPolicy: 'flex_24h' }, startsAt)).toBe(false);
    });

    it('firm: never eligible', () => {
        const startsAt = new Date(Date.now() + 100 * HOUR);
        expect(isRefundEligible({ refundPolicy: 'firm' }, startsAt)).toBe(false);
    });

    it('custom: defers to organizer (returns null = manual)', () => {
        const startsAt = new Date(Date.now() + 50 * HOUR);
        expect(isRefundEligible({ refundPolicy: 'custom' }, startsAt)).toBe(null);
    });
});

describe('computeRefundAmount', () => {
    it('returns full paid amount for flex_24h eligible', () => {
        const amount = computeRefundAmount({ refundPolicy: 'flex_24h' }, new Date(Date.now() + 30 * HOUR), 499);
        expect(amount).toBe(499);
    });

    it('returns 0 for ineligible', () => {
        const amount = computeRefundAmount({ refundPolicy: 'flex_24h' }, new Date(Date.now() + 5 * HOUR), 499);
        expect(amount).toBe(0);
    });
});
