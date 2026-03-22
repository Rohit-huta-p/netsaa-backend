import { z } from 'zod';

// ─── Create Ticket ───
export const createTicketSchema = z.object({
    category: z.enum(['payment', 'gig', 'event', 'account', 'safety', 'technical']),
    subcategory: z.string().max(100).optional(),
    priority: z.enum(['low', 'medium', 'high', 'critical']).optional().default('medium'),

    relatedEntity: z
        .object({
            type: z.enum(['gig', 'event', 'conversation', 'contract', 'payment']),
            entityId: z.string().min(1),
        })
        .optional(),

    // Message body for the initial ticket description
    message: z.string().min(5).max(5000),
});

// ─── Update Ticket Status ───
export const updateStatusSchema = z.object({
    status: z.enum(['open', 'in_review', 'waiting_user', 'resolved', 'closed']),
});

// ─── Create Message ───
export const createMessageSchema = z.object({
    message: z.string().min(1).max(10000),
    attachments: z
        .array(
            z.object({
                fileName: z.string(),
                fileUrl: z.string().url(),
                fileType: z.string(),
                fileSize: z.number().positive(),
            })
        )
        .optional()
        .default([]),
});

// ─── Escalate Ticket ───
export const escalateTicketSchema = z.object({
    escalatedTo: z.string().min(1),
    reason: z.string().min(5).max(1000),
});

// ─── Query Params: List Tickets ───
export const listTicketsQuerySchema = z.object({
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(100).optional().default(20),
    status: z.enum(['open', 'in_review', 'waiting_user', 'resolved', 'closed']).optional(),
    priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
    category: z.enum(['payment', 'gig', 'event', 'account', 'safety', 'technical']).optional(),
    sort: z.enum(['createdAt', 'priority', 'slaDeadline']).optional().default('createdAt'),
    order: z.enum(['asc', 'desc']).optional().default('desc'),
});

// ═══════════════════════════════════════════════════════════════
// HELP CENTER ARTICLES
// ═══════════════════════════════════════════════════════════════

// ─── Create / Update Article ───
export const createArticleSchema = z.object({
    title: z.string().min(3).max(200),
    slug: z.string().min(3).max(100).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with dashes').optional(),
    category: z.enum(['getting_started', 'payments', 'gigs', 'events', 'account', 'safety', 'technical']),
    audience: z.enum(['artist', 'organizer', 'all']).optional().default('all'),
    content: z.string().min(20).max(50000),
    excerpt: z.string().max(300).optional(),
    tags: z.array(z.string().max(50)).max(20).optional().default([]),
    relatedArticles: z.array(z.string()).optional().default([]),
    isPublished: z.boolean().optional().default(false),
});

export const updateArticleSchema = createArticleSchema.partial();

// ─── Search Articles ───
export const searchArticlesSchema = z.object({
    q: z.string().min(1).max(200).optional(),
    audience: z.enum(['artist', 'organizer', 'all']).optional(),
    category: z.enum(['getting_started', 'payments', 'gigs', 'events', 'account', 'safety', 'technical']).optional(),
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(50).optional().default(10),
    tab: z.enum(['artist', 'organizer', 'payments', 'safety']).optional(),
});

