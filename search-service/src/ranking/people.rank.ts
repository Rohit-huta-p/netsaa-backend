import { PEOPLE_WEIGHTS } from './weights';

/**
 * Builds the ranking clauses (should) for People search.
 * Deterministic rules:
 * - Name match * 3.0
 * - ArtistType match * 2.0
 * - Rating * 1.5 (using function score or path boost)
 */
export const buildPeopleRankingClauses = (query: string) => {
    if (!query) return [];

    const rankingClauses = [];

    // 1. Name Match (High Priority) using Autocomplete (EdgeGram)
    rankingClauses.push({
        autocomplete: {
            query: query,
            path: 'displayName',
            score: { boost: { value: PEOPLE_WEIGHTS.NAME_MATCH } },
            // fuzzy: { maxEdits: 1 } // Optional: strict prefix match vs fuzzy. index has minGrams 2.
            // keeping fuzzy usually helps with typos, but works best with standard mapping. 
            // For autocomplete, fuzzy is supported.
            fuzzy: { maxEdits: 1 },
        },
    });

    // 2. Artist Type & Speciality Match 
    // REMOVED: potentially not indexed in current mapping configuration (dynamic: false).
    // If you add 'artistType' or 'specialities' to the index, uncomment below:
    /*
    rankingClauses.push({
        text: {
            query: query,
            path: ['artistType', 'specialities'],
            score: { boost: { value: PEOPLE_WEIGHTS.ARTIST_TYPE_MATCH } },
        },
    });
    */

    // 3. Rating Boost (Path Boost methodology for MVP)
    // Ideally, we use 'function' score to multiply index-time rating field.
    // Atlas Search syntax: { near: { path: 'rating', origin: 5, pivot: 1, score: { boost: { value: 1.5 } } } }
    // OR simpler: just letting the text match score dominate, and adding a small static boost if rating is high.
    // For MVP strictness based on doc "Rating * 1.5", we can approximate or use function score if index supports numbers.
    // Assuming 'rating' is indexed as a number.
    rankingClauses.push({
        range: {
            path: 'cached.averageRating', // Updated to match index structure
            gte: 4,
            score: { boost: { value: PEOPLE_WEIGHTS.RATING_BOOST } }
        }
    });

    return rankingClauses;
};
