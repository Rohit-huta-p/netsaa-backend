import { describe, expect, it } from 'vitest';
import { recordOfflineSchema } from './transaction.dto';

/**
 * Schema-level locks for the offline-payment record DTO.
 *
 * Full controller-integration coverage (record / confirm / dispute /
 * idempotency / rate-limit / auth) needs a Mongo test harness which the
 * payment-service doesn't have yet. Tracked in DOCS/LATER.md → "Test
 * infrastructure" → "No integration test harness in payment-service".
 *
 * For now we lock the validator shape so the new `applicationId` field
 * (added post contract-rollback) doesn't silently regress.
 */

describe('recordOfflineSchema', () => {
    const baseValid = {
        toUserId: 'a1',
        amount: 50000,
        method: 'upi' as const,
    };

    it('accepts a minimal valid payload', () => {
        const result = recordOfflineSchema.safeParse(baseValid);
        expect(result.success).toBe(true);
    });

    it('accepts an applicationId (post contract-rollback addition)', () => {
        const result = recordOfflineSchema.safeParse({
            ...baseValid,
            applicationId: 'app123',
        });
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.applicationId).toBe('app123');
        }
    });

    it('accepts both applicationId and contractId together', () => {
        const result = recordOfflineSchema.safeParse({
            ...baseValid,
            applicationId: 'app123',
            contractId: 'c1',
        });
        expect(result.success).toBe(true);
    });

    it('rejects out-of-enum payment methods', () => {
        const result = recordOfflineSchema.safeParse({
            ...baseValid,
            method: 'crypto',
        });
        expect(result.success).toBe(false);
    });

    it('rejects negative amounts', () => {
        const result = recordOfflineSchema.safeParse({
            ...baseValid,
            amount: -100,
        });
        expect(result.success).toBe(false);
    });

    it('rejects missing toUserId', () => {
        const { toUserId, ...rest } = baseValid;
        const result = recordOfflineSchema.safeParse(rest);
        expect(result.success).toBe(false);
    });

    it('rejects malformed paidAt', () => {
        const result = recordOfflineSchema.safeParse({
            ...baseValid,
            paidAt: 'not-a-date',
        });
        expect(result.success).toBe(false);
    });

    it('rejects oversized note (>500 chars)', () => {
        const result = recordOfflineSchema.safeParse({
            ...baseValid,
            note: 'a'.repeat(501),
        });
        expect(result.success).toBe(false);
    });

    it('accepts all 7 supported payment methods', () => {
        const methods: Array<'upi' | 'bank_transfer' | 'cash' | 'google_pay' | 'credit_card' | 'debit_card' | 'other'> = [
            'upi',
            'bank_transfer',
            'cash',
            'google_pay',
            'credit_card',
            'debit_card',
            'other',
        ];
        for (const method of methods) {
            const result = recordOfflineSchema.safeParse({ ...baseValid, method });
            expect(result.success).toBe(true);
        }
    });
});
