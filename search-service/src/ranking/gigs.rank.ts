import { GIGS_WEIGHTS } from './weights';

/**
 * Builds the ranking clauses for Gigs search.
 */
export const buildGigsRankingClauses = (query: string) => {
    if (!query) return [];

    const rankingClauses = [];

    // 1. Title Match
    rankingClauses.push({
        text: {
            query: query,
            path: 'title',
            score: { boost: { value: GIGS_WEIGHTS.TITLE_MATCH } },
            fuzzy: { maxEdits: 1 },
        },
    });

    // 2. Artist Type Match
    rankingClauses.push({
        text: {
            query: query,
            path: 'artistType',
            score: { boost: { value: GIGS_WEIGHTS.ARTIST_TYPE_MATCH } },
        },
    });

    // 3. City Match
    rankingClauses.push({
        text: {
            query: query,
            path: 'city',
            score: { boost: { value: GIGS_WEIGHTS.CITY_MATCH } },
        },
    });

    // 4. Boosts (Urgent / Featured) - Independent of query usually, but added to score
    // We can add these as "should" clauses without a query requirement (using valid 'exists' or 'equals')
    // But strictly, 'text' requires query. We usually put these in the main compound.
    // However, function signature takes 'query'.
    // If we want global boosts, we can return clauses that don't depend on 'query' text if Atlas allows.
    // Atlas Search allows 'equals' or 'term' in 'should'.
    rankingClauses.push({
        equals: {
            path: 'isUrgent',
            value: true,
            score: { boost: { value: GIGS_WEIGHTS.URGENT_BOOST } }
        }
    });

    return rankingClauses;
};
