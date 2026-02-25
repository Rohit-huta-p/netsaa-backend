import { z } from 'zod';

/* ═══════════════════════════════════════════════════
 *  Settings PATCH Validator
 *  - All fields optional (partial updates)
 *  - .strict() on every level to reject unknown keys
 *  - Cross-field logical constraint on messaging + notifications
 * ═══════════════════════════════════════════════════ */

/* ── Privacy settings ── */
const privacySchema = z.object({
    profileVisibility: z.enum(['public', 'connections_only', 'private']).optional(),
    showEmail: z.boolean().optional(),
    showPhone: z.boolean().optional(),
    showLocation: z.boolean().optional(),
}).strict().optional();

/* ── Notification settings ── */
const notificationsSchema = z.object({
    emailNotifications: z.boolean().optional(),
    pushNotifications: z.boolean().optional(),
    allowConnectionRequests: z.boolean().optional(),
    messages: z.boolean().optional(),
    gigUpdates: z.boolean().optional(),
    eventUpdates: z.boolean().optional(),
    marketing: z.boolean().optional(),
}).strict().optional();

/* ── Messaging settings ── */
const messagingSchema = z.object({
    allowMessagesFrom: z.enum(['connections', 'anyone', 'none']).optional(),
    readReceipts: z.boolean().optional(),
}).strict().optional();

/* ── Account settings ── */
const accountSchema = z.object({
    language: z.string().min(2).max(10).optional(),
    timezone: z.string().min(1).max(64).optional(),
    currency: z.string().min(3).max(3).optional(),
}).strict().optional();

/* ── Forbidden top-level keys that must never sneak in ── */
const FORBIDDEN_KEYS = ['role', 'kycStatus', 'passwordHash', 'email', 'blocked',
    'paymentPreferences', 'stripeAccountId', 'stripeCustomerId',
    'otp', 'otpExpires', '_id', '__v'] as const;

/* ── Top-level update schema ── */
export const updateSettingsSchema = z.object({
    privacy: privacySchema,
    notifications: notificationsSchema,
    messaging: messagingSchema,
    account: accountSchema,
}).strict()
    .superRefine((data, ctx) => {
        // ── Logical constraint ──
        // If allowConnectionRequests is explicitly set to false,
        // allowMessagesFrom cannot be 'connections' (no connections → can't gate on them).
        if (
            data.notifications?.allowConnectionRequests === false &&
            data.messaging?.allowMessagesFrom === 'connections'
        ) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "allowMessagesFrom cannot be 'connections' when allowConnectionRequests is disabled",
                path: ['messaging', 'allowMessagesFrom'],
            });
        }
    });

/**
 * Check that the raw body doesn't contain forbidden top-level keys.
 * This runs BEFORE Zod parsing so we can give a clear error.
 */
export const containsForbiddenKeys = (body: Record<string, any>): string[] => {
    return FORBIDDEN_KEYS.filter(key => key in body);
};

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;
