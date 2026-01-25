import { z } from 'zod';

/**
 * Zod validation schema for Gig search filters.
 *
 * Rules:
 * - Numbers must be >= 0
 * - Arrays have max length limits
 * - Only valid enum values accepted
 * - Invalid filters are ignored (not thrown)
 */

// --- Enums ---

export const ArtistTypeEnum = z.enum([
    'Singer',
    'Musician',
    'Dancer',
    'Actor',
    'Model',
    'DJ',
    'Band',
    'Comedian',
    'Anchor',
    'Magician',
    'Other',
]);

export const ExperienceLevelEnum = z.enum([
    'Beginner',
    'Intermediate',
    'Professional',
    'Expert',
]);

export const GigTypeEnum = z.enum([
    'Live Performance',
    'Studio Recording',
    'Event',
    'Corporate',
    'Wedding',
    'Private Party',
    'Festival',
    'Club',
    'Tour',
    'Other',
]);

export const CategoryEnum = z.enum([
    'Music',
    'Dance',
    'Comedy',
    'Theatre',
    'Modeling',
    'Hosting',
    'Magic',
    'Other',
]);

export const CompensationModelEnum = z.enum([
    'Fixed',
    'Hourly',
    'Per Show',
    'Negotiable',
    'Revenue Share',
]);

export const PerksEnum = z.enum([
    'Travel',
    'Accommodation',
    'Food',
    'Equipment',
    'Costume',
    'Makeup',
    'Transportation',
    'Insurance',
]);

export const ApplicationDeadlineEnum = z.enum([
    '3days',
    '7days',
    '14days',
]);

export const SortModeEnum = z.enum([
    'relevance',
    'newest',
    'highestPay',
]);

// --- Array constraints ---
const MAX_ARRAY_LENGTH = 10;

// --- Safe array parser (ignores invalid items) ---
const safeStringArray = (enumSchema: z.ZodEnum<any>) =>
    z
        .array(z.string())
        .max(MAX_ARRAY_LENGTH)
        .optional()
        .transform((arr) => {
            if (!arr) return undefined;
            // Filter to only valid enum values
            const validValues = arr.filter((item) => {
                const result = enumSchema.safeParse(item);
                return result.success;
            });
            return validValues.length > 0 ? validValues : undefined;
        });

// --- Raw filter payload schema ---
export const GigSearchFilterPayloadSchema = z.object({
    // Hard filters
    artistTypes: safeStringArray(ArtistTypeEnum),
    experienceLevel: safeStringArray(ExperienceLevelEnum),
    gigType: safeStringArray(GigTypeEnum),
    category: safeStringArray(CategoryEnum),
    city: z.string().max(100).optional(),
    remoteOnly: z.boolean().optional(),
    minCompensation: z.number().min(0).optional(),
    compensationModel: safeStringArray(CompensationModelEnum),
    applicationDeadline: z
        .union([ApplicationDeadlineEnum, z.string().datetime()])
        .optional(),
    perks: safeStringArray(PerksEnum),
    excludeUnpaid: z.boolean().optional(),

    // Boost signals
    urgent: z.boolean().optional(),
    featured: z.boolean().optional(),
    higherPay: z.boolean().optional(),
    deadlineSoon: z.boolean().optional(),

    // Sort mode
    sortMode: SortModeEnum.optional(),
    sortBy: SortModeEnum.optional(), // Alias for sortMode
}).passthrough(); // Allow extra fields but ignore them

/**
 * Safely validates and transforms raw filter input.
 * Invalid fields are ignored, not thrown.
 *
 * @param input - Raw filter payload from frontend
 * @returns Validated and cleaned filter object
 */
export const validateGigFilters = (input: unknown): Partial<z.infer<typeof GigSearchFilterPayloadSchema>> => {
    // If input is not an object, return empty
    if (!input || typeof input !== 'object') {
        return {};
    }

    // Safe parse - returns default on failure
    const result = GigSearchFilterPayloadSchema.safeParse(input);

    if (result.success) {
        return result.data;
    }

    // On validation failure, try to salvage valid fields
    console.warn('Gig filter validation errors (ignored):', result.error.flatten());

    // Return empty object on complete failure
    // The normalizer will handle defaults
    return sanitizeFilters(input as Record<string, unknown>);
};

/**
 * Attempts to salvage valid fields from partially invalid input.
 * Invalid fields are silently dropped.
 */
const sanitizeFilters = (input: Record<string, unknown>): Record<string, any> => {
    const sanitized: Record<string, any> = {};

    // Try each field individually
    const fieldSchemas: Record<string, z.ZodTypeAny> = {
        artistTypes: safeStringArray(ArtistTypeEnum),
        experienceLevel: safeStringArray(ExperienceLevelEnum),
        gigType: safeStringArray(GigTypeEnum),
        category: safeStringArray(CategoryEnum),
        city: z.string().max(100),
        remoteOnly: z.boolean(),
        minCompensation: z.number().min(0),
        compensationModel: safeStringArray(CompensationModelEnum),
        applicationDeadline: z.union([ApplicationDeadlineEnum, z.string().datetime()]),
        perks: safeStringArray(PerksEnum),
        excludeUnpaid: z.boolean(),
        urgent: z.boolean(),
        featured: z.boolean(),
        higherPay: z.boolean(),
        deadlineSoon: z.boolean(),
        sortMode: SortModeEnum,
        sortBy: SortModeEnum,
    };

    for (const [key, schema] of Object.entries(fieldSchemas)) {
        if (key in input) {
            const result = schema.safeParse(input[key]);
            if (result.success && result.data !== undefined) {
                sanitized[key] = result.data;
            }
            // Invalid field silently ignored
        }
    }

    return sanitized;
};

// Export types
export type GigSearchFilterPayload = z.infer<typeof GigSearchFilterPayloadSchema>;
export type ValidArtistType = z.infer<typeof ArtistTypeEnum>;
export type ValidExperienceLevel = z.infer<typeof ExperienceLevelEnum>;
export type ValidGigType = z.infer<typeof GigTypeEnum>;
export type ValidCategory = z.infer<typeof CategoryEnum>;
export type ValidCompensationModel = z.infer<typeof CompensationModelEnum>;
export type ValidPerks = z.infer<typeof PerksEnum>;
export type ValidSortMode = z.infer<typeof SortModeEnum>;
