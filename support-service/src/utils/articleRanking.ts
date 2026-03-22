/**
 * Help Article Ranking Weights — Deterministic Scoring
 *
 * score =
 *   titleMatch * TITLE_WEIGHT
 * + contentMatch * CONTENT_WEIGHT
 * + tagMatch * TAG_WEIGHT
 * + (viewCount / VIEW_DIVISOR) * POPULARITY_WEIGHT
 * + freshnessBoost
 *
 * freshnessBoost:
 *   updated within 7 days  → FRESHNESS_BOOST
 *   updated within 30 days → FRESHNESS_BOOST * 0.5
 *   older                  → 0
 */

export const ARTICLE_WEIGHTS = {
    TITLE_WEIGHT: 5.0,       // Title is the strongest signal
    CONTENT_WEIGHT: 1.5,     // Content body match
    TAG_WEIGHT: 3.0,         // Exact tag match
    POPULARITY_WEIGHT: 0.5,  // viewCount-based boost
    VIEW_DIVISOR: 1000,      // Normalize viewCount
    FRESHNESS_BOOST: 2.0,    // Recently updated boost
};

/**
 * Build Atlas Search ranking clauses for help articles.
 * Used inside $search → compound.should[]
 */
export const buildArticleRankingClauses = (query: string): any[] => {
    const clauses: any[] = [];

    if (!query) return clauses;

    // Title match (highest weight)
    clauses.push({
        text: {
            query,
            path: 'title',
            score: { boost: { value: ARTICLE_WEIGHTS.TITLE_WEIGHT } },
            fuzzy: { maxEdits: 1 },
        },
    });

    // Content match
    clauses.push({
        text: {
            query,
            path: 'content',
            score: { boost: { value: ARTICLE_WEIGHTS.CONTENT_WEIGHT } },
        },
    });

    // Tag match (exact keyword boost)
    clauses.push({
        text: {
            query,
            path: 'tags',
            score: { boost: { value: ARTICLE_WEIGHTS.TAG_WEIGHT } },
        },
    });

    return clauses;
};

/**
 * Build the full Atlas Search $search stage for help articles.
 */
export const buildArticleSearchPipeline = (
    query: string,
    filters: {
        audience?: string;
        category?: string;
    }
): any[] => {
    const mustClauses: any[] = [];
    const shouldClauses = buildArticleRankingClauses(query);

    // Always filter to published articles
    mustClauses.push({
        equals: { path: 'isPublished', value: true },
    });

    // Audience filter
    if (filters.audience && filters.audience !== 'all') {
        mustClauses.push({
            compound: {
                should: [
                    { text: { query: filters.audience, path: 'audience' } },
                    { text: { query: 'all', path: 'audience' } },
                ],
                minimumShouldMatch: 1,
            },
        });
    }

    // Category filter
    if (filters.category) {
        mustClauses.push({
            text: { query: filters.category, path: 'category' },
        });
    }

    const pipeline: any[] = [
        {
            $search: {
                index: 'help_articles_search',
                compound: {
                    must: mustClauses,
                    should: shouldClauses,
                },
            },
        },
        {
            $addFields: {
                score: { $meta: 'searchScore' },
                // Popularity boost: viewCount / 1000 * 0.5
                popularityBoost: {
                    $multiply: [
                        { $divide: ['$viewCount', ARTICLE_WEIGHTS.VIEW_DIVISOR] },
                        ARTICLE_WEIGHTS.POPULARITY_WEIGHT,
                    ],
                },
                // Freshness boost based on updatedAt
                freshnessBoost: {
                    $cond: {
                        if: {
                            $gte: [
                                '$updatedAt',
                                new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
                            ],
                        },
                        then: ARTICLE_WEIGHTS.FRESHNESS_BOOST,
                        else: {
                            $cond: {
                                if: {
                                    $gte: [
                                        '$updatedAt',
                                        new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
                                    ],
                                },
                                then: ARTICLE_WEIGHTS.FRESHNESS_BOOST * 0.5,
                                else: 0,
                            },
                        },
                    },
                },
            },
        },
        {
            $addFields: {
                finalScore: {
                    $add: ['$score', '$popularityBoost', '$freshnessBoost'],
                },
            },
        },
        {
            $sort: { finalScore: -1 },
        },
    ];

    return pipeline;
};

/**
 * Build a basic Mongoose filter for non-Atlas-Search queries
 * (fallback when Atlas Search is unavailable).
 */
export const buildArticleFallbackFilter = (filters: {
    audience?: string;
    category?: string;
    query?: string;
}): Record<string, any> => {
    const filter: Record<string, any> = { isPublished: true };

    if (filters.audience && filters.audience !== 'all') {
        filter.audience = { $in: [filters.audience, 'all'] };
    }
    if (filters.category) {
        filter.category = filters.category;
    }
    if (filters.query) {
        filter.$or = [
            { title: { $regex: filters.query, $options: 'i' } },
            { tags: { $regex: filters.query, $options: 'i' } },
        ];
    }

    return filter;
};
