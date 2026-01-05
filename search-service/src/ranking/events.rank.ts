import { EVENTS_WEIGHTS } from './weights';

/**
 * Builds the ranking clauses for Events search.
 */
export const buildEventsRankingClauses = (query: string) => {
    if (!query) return [];

    const rankingClauses = [];

    // 1. Title Match
    rankingClauses.push({
        text: {
            query: query,
            path: 'title',
            score: { boost: { value: EVENTS_WEIGHTS.TITLE_MATCH } },
            fuzzy: { maxEdits: 1 },
        },
    });

    // 2. Event Type Match
    rankingClauses.push({
        text: {
            query: query,
            path: 'eventType',
            score: { boost: { value: EVENTS_WEIGHTS.EVENT_TYPE_MATCH } },
        },
    });

    // 3. Upcoming Boost (Recency)
    // Using 'near' to boost dates closer to now (but in future)
    // Or simple range boost.
    // For MVP, we stick to simple boost if it's strictly "upcoming".
    // Assuming 'startDate' > now is handled by filter/query.
    // We can use a `near` operator to score closer dates higher.
    rankingClauses.push({
        near: {
            path: 'startDate',
            origin: new Date(),
            pivot: 7 * 24 * 60 * 60 * 1000, // 7 days pivot
            score: { boost: { value: EVENTS_WEIGHTS.UPCOMING_BOOST } }
        }
    });

    return rankingClauses;
};
