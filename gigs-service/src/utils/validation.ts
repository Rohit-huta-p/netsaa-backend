import { z } from 'zod';

export const gigValidationSchema = z.object({
    title: z.string().min(1, 'Title is required'),
    description: z.string().min(1, 'Description is required'),
    type: z.enum(['one-time', 'recurring', 'contract']),
    category: z.string().min(1, 'Category is required'),
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
        model: z.enum(['fixed', 'hourly', 'per-day']),
        amount: z.number().min(0, 'Amount must be positive'),
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
    isFeatured: z.boolean().optional()
});

export const applyValidationSchema = z.object({
    coverNote: z.string().optional(),
    portfolioLinks: z.array(z.string().url()).optional()
});
