import { z } from 'zod';

export const gigValidationSchema = z.object({
    title: z.string().min(1, 'Title is required'),
    description: z.string().min(1, 'Description is required'),
    responsibilities: z.array(z.string()).optional(),
    type: z.enum(['one-time', 'recurring', 'contract']),
    tags: z.array(z.string()).optional(),

    artistTypes: z.array(z.string()).min(1, 'At least one artist type is required'),
    requiredSkills: z.array(z.string()).optional(),
    experienceLevel: z.enum(['beginner', 'intermediate', 'professional']),
    minExperienceYears: z.number().min(0).optional(),

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
        isRemote: z.boolean().optional(),
        geo: z.object({ lat: z.number(), lng: z.number() }).optional()
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
        // Optional: 'range' uses min/max, 'decide later' discloses nothing.
        amount: z.number().min(0, 'Amount must be positive').optional(),
        minAmount: z.number().min(0).optional(),
        maxAmount: z.number().min(0).optional(),
        currency: z.string().optional(),
        negotiable: z.boolean().optional(),
        perks: z.array(z.string()).optional()
    }),

    applicationDeadline: z.string().or(z.date()).optional(),
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

    // Gig-form v2 — persisted on the model; accept + keep them here too.
    headcount: z.number().int().positive().optional(),
    eventFunction: z.string().optional(),
    languagePreferences: z.array(z.string()).optional(),
    musicDetails: z.record(z.string(), z.unknown()).optional(),
    modelDetails: z.record(z.string(), z.unknown()).optional(),
    visualDetails: z.record(z.string(), z.unknown()).optional(),
    crewDetails: z.record(z.string(), z.unknown()).optional()
}).passthrough();

export const applyValidationSchema = z.object({
    coverNote: z.string().optional(),
    portfolioLinks: z.array(z.string().url()).optional()
});
