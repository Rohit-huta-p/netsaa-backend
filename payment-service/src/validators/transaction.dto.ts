import { z } from 'zod';
import { sanitizePlaintextField } from '../utils/sanitize';

export const initiatePaymentSchema = z.object({
    contractId: z.string().min(1, 'Contract ID is required'),
    paymentStructure: z.enum(['full', 'advance_30', 'balance_70']).default('full'),
});

export const confirmPaymentSchema = z.object({
    razorpayOrderId: z.string().min(1),
    razorpayPaymentId: z.string().min(1),
    razorpaySignature: z.string().min(1),
});

export const recordOfflineSchema = z.object({
    gigId: z.string().optional(),
    eventId: z.string().optional(),
    contractId: z.string().optional(),
    /**
     * Application reference for hires that don't have a Contract artifact.
     * Added post contract-rollback (Apr 28). Optional because event/sub-artist
     * payments don't have an application either.
     */
    applicationId: z.string().optional(),
    toUserId: z.string().min(1, 'Payee ID is required'),
    amount: z.number().positive('Amount must be positive'),
    method: z.enum(['upi', 'bank_transfer', 'cash', 'google_pay', 'credit_card', 'debit_card', 'other']),
    referenceId: z.string().optional(),
    note: z.string().max(500).optional(),
    /** User-reported payment date. Bounds validation (not future, not > 90d old) is done in the controller. */
    paidAt: z.string().datetime({ message: 'paidAt must be a valid ISO 8601 datetime' }).optional(),
    /** S3 URL of optional payment screenshot. Stored as-is; not treated as proof. */
    screenshotUrl: z.string().url('screenshotUrl must be a valid URL').max(2048).optional(),
});

export const confirmOfflineSchema = z.object({
    // Payee confirms receipt - no additional data needed beyond auth
});

/**
 * Raise a dispute on an offline transaction. Auth context (who raised it)
 * is injected by auth middleware — not validated here.
 */
export const raiseDisputeSchema = z.object({
    reason: z
        .string()
        .min(1, 'Dispute reason is required')
        .max(500, 'Dispute reason must be at most 500 characters')
        .transform((v) => sanitizePlaintextField(v, { maxLength: 500, fieldName: 'reason' })),
    evidenceUrls: z
        .array(z.string().url('Each evidence URL must be a valid URL'))
        .max(5, 'At most 5 evidence URLs allowed')
        .optional(),
});

export type InitiatePaymentDTO = z.infer<typeof initiatePaymentSchema>;
export type ConfirmPaymentDTO = z.infer<typeof confirmPaymentSchema>;
export type RecordOfflineDTO = z.infer<typeof recordOfflineSchema>;
export type RaiseDisputeDTO = z.infer<typeof raiseDisputeSchema>;
