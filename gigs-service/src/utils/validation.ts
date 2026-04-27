import { z } from 'zod';

// ─────────────────────────────────────────────────────────────
// Schema composition
// ─────────────────────────────────────────────────────────────
// `gigBaseSchema`     — raw field-level validation, no refinements
// `refineGig(schema)` — applies 5 cross-field HARD rules on top
// `gigValidationSchema` — for POST /v1/gigs (full create)
// `gigUpdateSchema`   — for PATCH /v1/gigs/:id (partial update)
//
// Why two exports instead of one `.partial()`?
// In Zod v4, applying `.partial()` AFTER `.superRefine(...)` may strip
// the refinement chain. We refine fresh on each variant to guarantee
// both paths enforce the same 5 rules. See plan-eng-review 2026-04-24
// P1 #1 for details.

const gigBaseSchema = z.object({
    title: z.string().min(1, 'Title is required'),
    description: z.string().min(1, 'Description is required'),
    type: z.enum(['one-time', 'recurring', 'contract']),
    /** @deprecated Plan 4 — superseded by `eventFunction`. Accepted on input for backward compat but new clients should use eventFunction. */
    category: z.string().min(1).optional(),
    tags: z.array(z.string()).optional(),

    artistTypes: z.array(z.string()).min(1, 'At least one artist type is required'),
    requiredSkills: z.array(z.string()).optional(),
    experienceLevel: z.enum(['beginner', 'intermediate', 'professional']),

    ageRange: z.object({
        min: z.number().min(0).optional(),
        max: z.number().optional()
    }).optional(),

    genderPreference: z.enum(['any', 'male', 'female', 'other']).optional(),
    physicalRequirements: z.string().optional(),

    location: z.object({
        city: z.string().min(1, 'City is required'),
        state: z.string().optional(),
        country: z.string().optional(),
        venueName: z.string().optional(),
        address: z.string().optional(),
        isRemote: z.boolean().optional()
    }),

    schedule: z.object({
        startDate: z.string().or(z.date()), // Accepts ISO string
        endDate: z.string().or(z.date()),
        durationLabel: z.string().optional(),
        timeCommitment: z.string().optional(),
        practiceDays: z.object({
            count: z.number().optional(),
            isPaid: z.boolean().optional(),
            mayExtend: z.boolean().optional(),
            notes: z.string().optional()
        }).optional()
    }),

    compensation: z.object({
        model: z.enum(['fixed', 'hourly', 'per-day', 'per-track', 'per-shoot']),
        amount: z.number().min(0, 'Amount must be positive').optional(),
        minAmount: z.number().min(0).optional(),
        maxAmount: z.number().min(0).optional(),
        currency: z.string().optional(),
        negotiable: z.boolean().optional(),
        perks: z.array(z.string()).optional()
    }),

    applicationDeadline: z.string().or(z.date()),
    maxApplications: z.number().optional(),

    mediaRequirements: z.object({
        headshots: z.boolean().optional(),
        fullBody: z.boolean().optional(),
        videoReel: z.boolean().optional(),
        audioSample: z.boolean().optional(),
        notes: z.string().optional()
    }).optional(),

    status: z.enum(['draft', 'published', 'paused', 'closed', 'expired']).optional(),
    isUrgent: z.boolean().optional(),
    isFeatured: z.boolean().optional(),

    // ── Booking terms (Phase 2A) ───────────────────────────────────
    // Master/template values that get instantiated into the per-hire Contract
    // at booking time. Optional on input; Mongoose applies defaults
    // ('full' / '48h') if omitted on a new gig.
    paymentStructure: z.enum(['full', 'advance_balance']).optional(),
    cancellationPolicy: z.enum(['24h', '48h', '72h']).optional(),
    cancellationForfeitPct: z.number().min(0).max(100).optional(),

    // ── GigForm v2 additions (Plan 4) ──────────────────────────────

    eventFunction: z.string().trim().min(1).max(80, 'Event function must be 80 characters or fewer').optional(),

    languagePreferences: z.array(z.string()).optional(),

    ancillaryLogistics: z.object({
        provided: z.array(z.string()).default([])
    }).optional(),

    musicDetails: z.object({
        genres: z.array(z.string()).optional(),
        equipmentProvided: z.boolean().optional(),
        bpm: z.number().positive().optional(),
        musicalKey: z.string().optional(),
        deliverableFormats: z.array(z.string()).optional(),
        referenceTracks: z.array(z.string()).optional(),
        turnaroundDays: z.number().int().positive().optional(),
        revisionsIncluded: z.number().int().min(0).optional(),
        setLengthHours: z.number().positive().optional(),
        bandSize: z.number().int().positive().optional(),
        attirePreference: z.enum(['formal', 'casual', 'themed', 'open']).optional()
    }).optional(),

    modelDetails: z.object({
        shootType: z.enum(['Editorial', 'Commercial', 'Fashion', 'Fitness', 'Lifestyle', 'Art']).optional(),
        nudityLevel: z.enum(['None', 'Implied', 'Partial', 'Artistic', 'Nude']).optional(),
        wardrobeNotes: z.string().optional(),
        usageRights: z.array(z.string()).optional(),
        releaseRequired: z.boolean().optional(),
        measurements: z.object({
            height: z.string().optional(),
            bust: z.string().optional(),
            waist: z.string().optional(),
            hips: z.string().optional(),
            hair: z.string().optional(),
            eyes: z.string().optional()
        }).optional()
    }).optional(),

    visualDetails: z.object({
        roleType: z.enum(['lead', 'supporting', 'extra', 'background']).optional(),
        // Multi-select per Plan 5 UX feedback — hirers want to accept
        // multiple body types ("slim OR athletic" etc) for inclusivity.
        bodyType: z.array(z.enum(['slim', 'athletic', 'average', 'plus', 'any'])).optional()
    }).optional(),

    crewDetails: z.object({
        deliverables: z.string().optional(),
        styleReferences: z.array(z.string()).optional(),
        equipmentProvided: z.boolean().optional()
    }).optional()
});

/**
 * Applies the 5 cross-field HARD safety rules to any shape derived from
 * `gigBaseSchema` (full or partial). Returns the refined schema.
 *
 * Rules fire only when the relevant fields are PRESENT in the parsed
 * data — so on partial updates, a patch that doesn't touch artistTypes
 * won't trip rules 1-3 and 5, but will trip rule 4 if startDate is in
 * the patch.
 */
function refineGig<T extends z.ZodTypeAny>(schema: T): T {
    return schema.superRefine((data: any, ctx) => {
        // Rule 1: artistTypes cap at 3
        if (data.artistTypes && data.artistTypes.length > 3) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['artistTypes'],
                message: 'Maximum 3 performer types per gig. Split into separate gigs for more.'
            });
        }

        // Rule 2: Model requires nudityLevel + shootType
        if (data.artistTypes?.includes('Model')) {
            if (!data.modelDetails?.nudityLevel) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ['modelDetails', 'nudityLevel'],
                    message: 'Nudity level is required for model gigs. Select None if not applicable.'
                });
            }
            if (!data.modelDetails?.shootType) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ['modelDetails', 'shootType'],
                    message: 'Shoot type is required for model gigs.'
                });
            }
        }

        // Rule 3: Music Producer requires turnaroundDays
        if (data.artistTypes?.includes('Music Producer')) {
            if (data.musicDetails?.turnaroundDays === undefined) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ['musicDetails', 'turnaroundDays'],
                    message: 'Turnaround days required for music producer gigs.'
                });
            }
        }

        // Rule 4: startDate must be today or later — compared in IST (Asia/Kolkata)
        // so hirers submitting in the evening IST aren't rejected by UTC drift.
        if (data.schedule?.startDate) {
            const start = new Date(data.schedule.startDate);
            // Build "today 00:00:00 IST" as a Date object.
            const nowIST = new Date(
                new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })
            );
            nowIST.setHours(0, 0, 0, 0);
            if (start < nowIST) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ['schedule', 'startDate'],
                    message: 'Start date must be today or later.'
                });
            }
        }

        // Rule 5: Underage + adult content blocked
        if (
            data.ageRange?.min !== undefined &&
            data.ageRange.min < 18 &&
            data.modelDetails?.nudityLevel &&
            data.modelDetails.nudityLevel !== 'None'
        ) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['modelDetails', 'nudityLevel'],
                message: 'Roles involving minors cannot require nudity. Raise the minimum age or set nudity to None.'
            });
        }
    });
}

/** Full-create schema: every required field must be present, refinements applied. */
export const gigValidationSchema = refineGig(gigBaseSchema);

/** Update schema: every top-level field is optional, refinements applied fresh. */
export const gigUpdateSchema = refineGig(gigBaseSchema.partial());

export const applyValidationSchema = z.object({
    coverNote: z.string().optional(),
    portfolioLinks: z.array(z.string().url()).optional()
});
