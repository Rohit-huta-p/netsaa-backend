import { z } from 'zod';

/**
 * PRD v4 Registration Validator — Two-Context Model
 *
 * No role selection. Every user gets both artist and hirer contexts.
 * Registration is minimal: name, email, password, optional intent.
 *
 * Age-gate (Indian Contract Act §11): dateOfBirth is optional at signup but
 * REQUIRED before any contract-signing action. If a minor registers, the
 * User model pre-save hook sets guardianStatus='pending' and downstream
 * contract endpoints block until a guardian co-signs.
 */

const MIN_AGE_YEARS = 13;
const MAX_AGE_YEARS = 120;
const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

const dateOfBirthSchema = z
    .union([z.string(), z.date()])
    .transform((val) => (val instanceof Date ? val : new Date(val)))
    .refine((d) => !isNaN(d.getTime()), { message: 'dateOfBirth must be a valid date' })
    .refine((d) => d.getTime() < Date.now(), { message: 'dateOfBirth must be in the past' })
    .refine((d) => (Date.now() - d.getTime()) / MS_PER_YEAR <= MAX_AGE_YEARS, {
        message: `dateOfBirth must be within the last ${MAX_AGE_YEARS} years`,
    })
    .refine((d) => (Date.now() - d.getTime()) / MS_PER_YEAR >= MIN_AGE_YEARS, {
        message: `You must be at least ${MIN_AGE_YEARS} to use NETSA`,
    });

export const registerSchema = z.object({
    user: z.object({
        displayName: z.string().min(1, 'displayName is required'),
        email: z.string().email('Invalid email'),
        password: z.string().min(8, 'Password must be at least 8 characters'),
        phoneNumber: z.string().optional(),
        dateOfBirth: dateOfBirthSchema.optional(),
        marketingConsent: z.boolean().optional().default(false),
        // PRD v4 Step 4: "What brings you to NETSA?" (multi-select interest signal)
        intent: z
            .array(z.enum(['find_gigs', 'hire_artists', 'learn_workshops', 'host_events']))
            .optional()
            .default([]),
    }),
});

export type RegisterInput = z.infer<typeof registerSchema>;
