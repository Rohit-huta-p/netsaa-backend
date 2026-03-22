import { z } from 'zod';
import { ORGANIZER_TYPE_CATEGORIES } from '../models/Organizer';

/* ═══════════════════════════════════════════════════
 *  PATCH /api/organizers/me — Partial Update DTO
 *  All fields optional. Cross-field constraints applied via superRefine.
 * ═══════════════════════════════════════════════════ */

const billingDetailsSchema = z.object({
    legalBusinessName: z.string().optional(),
    gstNumber: z.string().optional(),
    billingAddress: z.string().optional(),
    state: z.string().optional(),
    pincode: z.string().optional(),
    country: z.string().optional(),
}).strict().optional();

/* ── Forbidden keys that must never be patched ── */
const FORBIDDEN_KEYS = [
    'userId', '_id', '__v',
    'organizerStats', 'verification',
    'createdAt', 'updatedAt',
] as const;

export const updateOrganizerSchema = z.object({
    organizerTypeCategory: z.enum(ORGANIZER_TYPE_CATEGORIES).optional(),
    organizationName: z.string().optional(),
    organizationType: z.string().optional(),
    isCustomCategory: z.boolean().optional(),
    customCategoryLabel: z.string().optional(),
    organizationWebsite: z.string().optional(),
    logoUrl: z.string().optional(),
    billingDetails: billingDetailsSchema,
}).strict()
    .superRefine((data, ctx) => {
        // customCategoryLabel required when isCustomCategory is true
        if (data.isCustomCategory === true && !data.customCategoryLabel?.trim()) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'customCategoryLabel is required when isCustomCategory is true',
                path: ['customCategoryLabel'],
            });
        }
    });

/**
 * Check that the raw body doesn't contain forbidden top-level keys.
 */
export const containsForbiddenKeys = (body: Record<string, any>): string[] => {
    return FORBIDDEN_KEYS.filter(key => key in body);
};

export type UpdateOrganizerInput = z.infer<typeof updateOrganizerSchema>;
