import { GigSearchBoostSignals, GigSearchSortMode } from '../modules/search/dto/gig-search-filter.dto';

/**
 * Deterministic Scoring Formula:
 *
 * score =
 *   textRelevance * 3
 * + (isFeatured ? 2 : 0)
 * + (isUrgent ? 1.5 : 0)
 * + (higherPay ? compensation.amount / 10000 : 0)
 * + (deadlineSoon ? 1 : 0)
 *
 * deadlineSoon = applicationDeadline within 7 days from now
 */

// Text relevance multiplier
const TEXT_RELEVANCE_MULTIPLIER = 3;

// Boost values
const FEATURED_BOOST = 2;
const URGENT_BOOST = 1.5;
const DEADLINE_SOON_BOOST = 1;
const PAY_DIVISOR = 10000;

/**
 * Builds the ranking (should) clauses for Gigs search.
 * These contribute to the relevance score via Atlas Search compound.should
 */
export const buildGigsRankingClauses = (query: string): any[] => {
    const rankingClauses: any[] = [];

    // --- Text Relevance (only if query provided) ---
    if (query) {
        // Title Match (highest weight for text relevance)
        rankingClauses.push({
            text: {
                query: query,
                path: 'title',
                score: { boost: { value: TEXT_RELEVANCE_MULTIPLIER } },
                fuzzy: { maxEdits: 1 },
            },
        });

        // Artist Type Match
        rankingClauses.push({
            text: {
                query: query,
                path: 'artistType',
                score: { boost: { value: TEXT_RELEVANCE_MULTIPLIER * 0.66 } }, // ~2
            },
        });

        // City Match
        rankingClauses.push({
            text: {
                query: query,
                path: 'city',
                score: { boost: { value: TEXT_RELEVANCE_MULTIPLIER * 0.5 } }, // ~1.5
            },
        });

        // Description Match (lower weight)
        rankingClauses.push({
            text: {
                query: query,
                path: 'description',
                score: { boost: { value: TEXT_RELEVANCE_MULTIPLIER * 0.33 } }, // ~1
            },
        });
    }

    // --- Featured Boost (+2) ---
    rankingClauses.push({
        equals: {
            path: 'isFeatured',
            value: true,
            score: { boost: { value: FEATURED_BOOST } },
        },
    });

    // --- Urgent Boost (+1.5) ---
    rankingClauses.push({
        equals: {
            path: 'isUrgent',
            value: true,
            score: { boost: { value: URGENT_BOOST } },
        },
    });

    return rankingClauses;
};

/**
 * Builds boost clauses based on user-selected boost signals.
 * Applied in addition to the base ranking clauses.
 */
export const buildGigsBoostClauses = (boostSignals?: GigSearchBoostSignals): any[] => {
    if (!boostSignals) return [];

    const boostClauses: any[] = [];

    // Featured boost (if user wants featured gigs prioritized)
    if (boostSignals.featured) {
        boostClauses.push({
            equals: {
                path: 'isFeatured',
                value: true,
                score: { boost: { value: FEATURED_BOOST * 2 } }, // Extra boost when user prefers featured
            },
        });
    }

    // Urgent boost (if user wants urgent gigs prioritized)
    if (boostSignals.urgent) {
        boostClauses.push({
            equals: {
                path: 'isUrgent',
                value: true,
                score: { boost: { value: URGENT_BOOST * 2 } }, // Extra boost
            },
        });
    }

    // Higher pay boost (boost compensation.amount)
    // This is applied via function score in MongoDB, but we can use range boosts
    if (boostSignals.higherPay) {
        // Boost gigs with compensation >= 50000 (higher tier)
        boostClauses.push({
            range: {
                path: 'compensation.amount',
                gte: 50000,
                score: { boost: { value: 5 } }, // 50000 / 10000 = 5
            },
        });
        // Medium tier boost
        boostClauses.push({
            range: {
                path: 'compensation.amount',
                gte: 20000,
                lt: 50000,
                score: { boost: { value: 2 } },
            },
        });
    }

    // Deadline soon boost (applicationDeadline within 7 days)
    if (boostSignals.deadlineSoon) {
        const now = new Date();
        const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

        boostClauses.push({
            range: {
                path: 'applicationDeadline',
                gte: now,
                lte: sevenDaysFromNow,
                score: { boost: { value: DEADLINE_SOON_BOOST } },
            },
        });
    }

    return boostClauses;
};

/**
 * Builds the $sort stage for sorting overrides.
 *
 * Sorting modes:
 * - relevance: Use search score (default, no override needed)
 * - newest: Sort by _sortDate DESC (publishedAt, falling back to createdAt)
 * - highestPay: Sort by _sortPay DESC (max of amount / maxAmount / minAmount)
 *
 * Sorts on the computed keys that buildGigsPipeline adds in $addFields and keeps
 * through the $project — NOT the raw paths. publishedAt and compensation.amount
 * are both optional on the Gig model (range gigs carry min/maxAmount instead, and
 * a gig may have no publishedAt), and the $project drops every field except the
 * ones named, so sorting on the raw paths was a silent no-op. gigs.search.ts
 * splices this stage in right before $facet (after the $project), so the keys are
 * present. Missing keys sort last under DESC (negotiable/undated gigs sink).
 */
export const buildGigsSortStage = (sortMode?: GigSearchSortMode): any | null => {
    switch (sortMode) {
        case 'newest':
            return {
                $sort: {
                    _sortDate: -1,
                    score: -1, // Secondary sort by relevance
                },
            };

        case 'highestPay':
            return {
                $sort: {
                    _sortPay: -1,
                    score: -1, // Secondary sort by relevance
                },
            };

        case 'relevance':
        default:
            // Default: sort by search score (handled by Atlas Search)
            return null;
    }
};

/**
 * Combines all ranking and boost clauses for the pipeline.
 */
export const buildGigsAllRankingClauses = (
    query: string,
    boostSignals?: GigSearchBoostSignals
): any[] => {
    const baseClauses = buildGigsRankingClauses(query);
    const boostClauses = buildGigsBoostClauses(boostSignals);
    return [...baseClauses, ...boostClauses];
};
