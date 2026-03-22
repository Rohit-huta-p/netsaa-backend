import { z } from 'zod';
import { ORGANIZER_TYPE_CATEGORIES } from '../models/Organizer';

/* ---------- Sub-schemas ---------- */

const billingDetailsSchema = z.object({
    legalBusinessName: z.string().optional(),
    gstNumber: z.string().optional(),
    billingAddress: z.string().optional(),
    state: z.string().optional(),
    pincode: z.string().optional(),
    country: z.string().optional(),
});

const organizerProfileSchema = z.object({
    organizerTypeCategory: z.enum(ORGANIZER_TYPE_CATEGORIES),
    organizationName: z.string().optional(),
    organizationType: z.string().optional(),              // 'individual' | 'company'
    isCustomCategory: z.boolean().optional().default(false),
    customCategoryLabel: z.string().optional(),
    bio: z.string().optional(),
    organizationWebsite: z.string().optional(),
    logoUrl: z.string().optional(),
    billingDetails: billingDetailsSchema.optional(),
    intent: z
        .array(z.enum(['find_gigs', 'hire_artists', 'learn_workshops', 'host_events']))
        .optional(),
}).superRefine((data, ctx) => {
    // organizationName required unless individual
    if (data.organizationType !== 'individual' && !data.organizationName) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'organizationName is required for non-individual organizers',
            path: ['organizationName'],
        });
    }
    // customCategoryLabel required when isCustomCategory is true
    if (data.isCustomCategory && !data.customCategoryLabel?.trim()) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'customCategoryLabel is required when isCustomCategory is true',
            path: ['customCategoryLabel'],
        });
    }
});

/* ---------- Top-level register schema ---------- */

export const registerSchema = z
    .object({
        user: z.object({
            displayName: z.string().min(1, 'displayName is required'),
            email: z.string().email('Invalid email'),
            password: z.string().min(6, 'Password must be at least 6 characters'),
            phoneNumber: z.string().optional(),
            role: z.enum(['artist', 'organizer']).default('artist'),
            marketingConsent: z.boolean().optional().default(false),
        }),
        organizerProfile: organizerProfileSchema.optional(),
    })
    .superRefine((data, ctx) => {
        // Rule: organizer role requires organizerProfile
        if (data.user.role === 'organizer' && !data.organizerProfile) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'organizerProfile is required when role is organizer',
                path: ['organizerProfile'],
            });
        }
    });

export type RegisterInput = z.infer<typeof registerSchema>;
