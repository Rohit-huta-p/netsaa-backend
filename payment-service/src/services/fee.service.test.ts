import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type FeeService = typeof import('./fee.service');

/**
 * fee.service resolves PAYMENT_PHASE once at module load. Each test that cares
 * about the active phase must stub the env var, then reset the module registry
 * and re-import so the cached ACTIVE_PHASE is recomputed from the stubbed env.
 */
async function loadService(phase?: 'mvp' | 'phase2'): Promise<FeeService> {
    if (phase === undefined) {
        vi.stubEnv('PAYMENT_PHASE', '');
    } else {
        vi.stubEnv('PAYMENT_PHASE', phase);
    }
    vi.resetModules();
    return await import('./fee.service');
}

afterEach(() => {
    vi.unstubAllEnvs();
});

describe('getCurrentPhase', () => {
    it('defaults to mvp when PAYMENT_PHASE is unset', async () => {
        const fee = await loadService();
        expect(fee.getCurrentPhase()).toBe('mvp');
    });

    it('returns phase2 when PAYMENT_PHASE=phase2', async () => {
        const fee = await loadService('phase2');
        expect(fee.getCurrentPhase()).toBe('phase2');
    });
});

describe('calculateFees — MVP phase', () => {
    it('returns 0% rate for all transaction types in mvp', async () => {
        const fee = await loadService('mvp');

        const gig = fee.calculateFees(10000, 'gig_payment', 'new');
        expect(gig.rate).toBe(0);
        expect(gig.platformFee).toBe(0);
        expect(gig.artistReceives).toBe(10000);

        const event = fee.calculateFees(500, 'event_ticket', 'trusted');
        expect(event.rate).toBe(0);
        expect(event.platformFee).toBe(0);
        expect(event.artistReceives).toBe(500);

        const subArtist = fee.calculateFees(2500, 'sub_artist', 'rising');
        expect(subArtist.rate).toBe(0);
        expect(subArtist.platformFee).toBe(0);
        expect(subArtist.artistReceives).toBe(2500);
    });
});

describe('calculateFees — Phase 2', () => {
    let fee: FeeService;

    beforeEach(async () => {
        fee = await loadService('phase2');
    });

    it('applies 12% rate to gig_payment for non-verified tiers', () => {
        const result = fee.calculateFees(10000, 'gig_payment', 'new');
        expect(result.rate).toBeCloseTo(0.12, 10);
        expect(result.platformFee).toBe(1200);
        expect(result.artistReceives).toBe(8800);
    });

    it('applies 10% rate to event_ticket', () => {
        const result = fee.calculateFees(1000, 'event_ticket', 'rising');
        expect(result.rate).toBeCloseTo(0.10, 10);
        expect(result.platformFee).toBe(100);
        expect(result.artistReceives).toBe(900);
    });

    it('applies 8% rate to sub_artist payments', () => {
        const result = fee.calculateFees(5000, 'sub_artist', 'trusted');
        expect(result.rate).toBeCloseTo(0.08, 10);
        expect(result.platformFee).toBe(400);
        expect(result.artistReceives).toBe(4600);
    });

    it('applies 10% verified-tier override on gig_payment (not the default 12%)', () => {
        const result = fee.calculateFees(10000, 'gig_payment', 'verified');
        expect(result.rate).toBeCloseTo(0.10, 10);
        expect(result.platformFee).toBe(1000);
        expect(result.artistReceives).toBe(9000);
    });

    it('does NOT apply the verified override to non-gig transaction types', () => {
        const event = fee.calculateFees(1000, 'event_ticket', 'verified');
        expect(event.rate).toBeCloseTo(0.10, 10);

        const subArtist = fee.calculateFees(1000, 'sub_artist', 'verified');
        expect(subArtist.rate).toBeCloseTo(0.08, 10);
    });
});

describe('calculateFees — offline_record', () => {
    it('always returns 0% regardless of phase or tier (MVP)', async () => {
        const fee = await loadService('mvp');
        const result = fee.calculateFees(10000, 'offline_record', 'verified');
        expect(result.rate).toBe(0);
        expect(result.platformFee).toBe(0);
        expect(result.artistReceives).toBe(10000);
    });

    it('always returns 0% regardless of phase or tier (Phase 2)', async () => {
        const fee = await loadService('phase2');
        const result = fee.calculateFees(10000, 'offline_record', 'verified');
        expect(result.rate).toBe(0);
        expect(result.platformFee).toBe(0);
        expect(result.artistReceives).toBe(10000);
    });
});

describe('getFeeRate', () => {
    it('returns 0 for all types in mvp', async () => {
        const fee = await loadService('mvp');
        expect(fee.getFeeRate('gig_payment', 'new')).toBe(0);
        expect(fee.getFeeRate('event_ticket', 'trusted')).toBe(0);
        expect(fee.getFeeRate('sub_artist', 'verified')).toBe(0);
        expect(fee.getFeeRate('offline_record', 'verified')).toBe(0);
    });

    it('returns phase2 rates with verified override on gig_payment only', async () => {
        const fee = await loadService('phase2');
        expect(fee.getFeeRate('gig_payment', 'new')).toBeCloseTo(0.12, 10);
        expect(fee.getFeeRate('gig_payment', 'verified')).toBeCloseTo(0.10, 10);
        expect(fee.getFeeRate('event_ticket', 'verified')).toBeCloseTo(0.10, 10);
        expect(fee.getFeeRate('sub_artist', 'verified')).toBeCloseTo(0.08, 10);
        expect(fee.getFeeRate('offline_record', 'verified')).toBe(0);
    });
});

describe('computeTrustWeight', () => {
    let fee: FeeService;

    beforeEach(async () => {
        fee = await loadService('mvp');
    });

    it('returns 1.0 for on_platform + confirmed', () => {
        expect(fee.computeTrustWeight('on_platform', 'confirmed')).toBe(1.0);
    });

    it('returns 1.0 for on_platform + completed', () => {
        expect(fee.computeTrustWeight('on_platform', 'completed')).toBe(1.0);
    });

    it('returns 0.7 for off_platform + confirmed', () => {
        expect(fee.computeTrustWeight('off_platform', 'confirmed')).toBe(0.7);
    });

    it('returns 0.7 for off_platform + completed', () => {
        expect(fee.computeTrustWeight('off_platform', 'completed')).toBe(0.7);
    });

    it('returns -1.0 for disputed regardless of payment type', () => {
        expect(fee.computeTrustWeight('on_platform', 'disputed')).toBe(-1.0);
        expect(fee.computeTrustWeight('off_platform', 'disputed')).toBe(-1.0);
    });

    it('returns 0 for created (not yet finalized)', () => {
        expect(fee.computeTrustWeight('on_platform', 'created')).toBe(0);
        expect(fee.computeTrustWeight('off_platform', 'created')).toBe(0);
    });

    it('returns 0 for other non-final statuses (recorded/paid/failed/expired/reopened/refunded)', () => {
        const nonFinal = ['recorded', 'paid', 'failed', 'expired', 'reopened', 'refunded'] as const;
        for (const status of nonFinal) {
            expect(fee.computeTrustWeight('on_platform', status)).toBe(0);
            expect(fee.computeTrustWeight('off_platform', status)).toBe(0);
        }
    });
});

describe('isEligibleFor3070', () => {
    it('allows trustScore >= 51 OR completedPayments >= 2', async () => {
        const fee = await loadService('mvp');
        expect(fee.isEligibleFor3070(51, 0)).toBe(true);
        expect(fee.isEligibleFor3070(0, 2)).toBe(true);
        expect(fee.isEligibleFor3070(50, 1)).toBe(false);
        expect(fee.isEligibleFor3070(0, 0)).toBe(false);
    });
});

describe('parseRateEnv (via getFeeRate with env var override)', () => {
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it.each([
        ['valid rate 0.12 is applied',         '0.12',  0.12],
        ['exactly 0 is applied',               '0',     0],
    ])('%s', async (_label, envVal, expected) => {
        vi.stubEnv('FEE_RATE_GIG_PHASE2', envVal);
        vi.stubEnv('PAYMENT_PHASE', 'phase2');
        vi.resetModules();
        const fee = await import('./fee.service');
        expect(fee.getFeeRate('gig_payment', 'new')).toBe(expected);
    });

    it.each([
        ['invalid rate 1.5 (>= 0.5) uses default', '1.5'],
        ['invalid string "abc" uses default',       'abc'],
        ['negative -0.1 uses default',              '-0.1'],
        ['exactly 0.5 is rejected, uses default',  '0.5'],
        ['empty string uses default',               ''],
    ])('%s', async (_label, envVal) => {
        vi.stubEnv('FEE_RATE_GIG_PHASE2', envVal);
        vi.stubEnv('PAYMENT_PHASE', 'phase2');
        vi.resetModules();
        const fee = await import('./fee.service');
        // Default for FEE_RATE_GIG_PHASE2 is 0.12
        expect(fee.getFeeRate('gig_payment', 'new')).toBe(0.12);
    });
});

describe('calculateFees — rounding regression', () => {
    it('calculateFees(100.005, gig_payment, new) — documents actual rounding behavior', async () => {
        const fee = await loadService('phase2');
        const result = fee.calculateFees(100.005, 'gig_payment', 'new');
        // rate = 0.12; Math.round(100.005 * 0.12 * 100) / 100 = Math.round(1200.06) / 100 = 1200.06 / 100
        // JS floating point: 100.005 * 0.12 = 12.0006; * 100 = 1200.06; Math.round = 1200; / 100 = 12
        // Actual output is recorded here as a regression baseline — not asserted as "correct"
        expect(result.rate).toBe(0.12);
        expect(result.platformFee).toBe(Math.round(100.005 * 0.12 * 100) / 100);
        expect(result.artistReceives).toBe(100.005 - result.platformFee);
    });
});
