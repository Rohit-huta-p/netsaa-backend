import { z } from 'zod';
import { sanitizePlaintextField } from '../utils/sanitize';

/**
 * Contract DTOs — all validation + sanitization happens here.
 * Controllers receive already-sanitized values.
 */

// Shared — custom T&C sanitizer. Runs as a Zod transform so downstream
// callers get the cleaned string without thinking about it.
const customTermsField = z
    .string()
    .max(2000, 'Custom terms must be at most 2000 characters')
    .optional()
    .transform((v) =>
        v == null
            ? undefined
            : sanitizePlaintextField(v, { maxLength: 2000, fieldName: 'customTerms' })
    );

export const createContractSchema = z.object({
    gigId: z.string().min(1, 'Gig ID is required'),
    artistId: z.string().min(1, 'Artist ID is required'),
    /**
     * MVP hybrid payment (PRD §8.3.2 Stage 2). Hirer selects at confirm-hire.
     * Default on-platform (recommended). Can be switched before artist signs.
     */
    paymentMethod: z.enum(['on_platform', 'off_platform']).default('on_platform'),
    terms: z.object({
        gigTitle: z.string().min(1).max(200),
        dates: z.object({
            start: z.string().or(z.date()),
            end: z.string().or(z.date()).optional(),
        }),
        location: z.object({
            venue: z.string().max(200).optional(),
            city: z.string().min(1).max(100),
            state: z.string().max(100).optional(),
        }),
        scopeOfWork: z.string().min(1).max(4000),
        amount: z.number().positive('Amount must be positive'),
        paymentStructure: z.enum(['full', 'advance_balance']).default('full'),
        cancellationTerms: z.string().max(2000).optional(),
        // Custom T&C — plain text only, sanitized via transform.
        customTerms: customTermsField,
    }),
});

/**
 * Switch payment method before artist signs. After artist signs, use an
 * amendment round instead.
 */
export const switchPaymentMethodSchema = z.object({
    paymentMethod: z.enum(['on_platform', 'off_platform']),
});

export const signContractSchema = z.object({
    deviceInfo: z.string().max(500).optional(),
    otpVerified: z.boolean().optional(),
    /**
     * MVP ceremony audit events captured from the signing UI.
     * Server MAY cross-validate (e.g. scrollEndedAt should be before signedAt).
     */
    scrollEndedAt: z.string().datetime().optional(),
    doubleConfirmedAt: z.string().datetime().optional(),
    /** Phase 2 biometric check. */
    biometricPassedAt: z.string().datetime().optional(),
});

export const amendContractSchema = z.object({
    changes: z.record(z.string(), z.any()),
    reason: z
        .string()
        .min(1, 'Amendment reason is required')
        .max(500)
        .transform((v) => sanitizePlaintextField(v, { maxLength: 500, fieldName: 'reason' })),
});

export const respondAmendmentSchema = z.object({
    status: z.enum(['accepted', 'rejected']),
});

export type CreateContractDTO = z.infer<typeof createContractSchema>;
export type SwitchPaymentMethodDTO = z.infer<typeof switchPaymentMethodSchema>;
export type SignContractDTO = z.infer<typeof signContractSchema>;
export type AmendContractDTO = z.infer<typeof amendContractSchema>;
export type RespondAmendmentDTO = z.infer<typeof respondAmendmentSchema>;
