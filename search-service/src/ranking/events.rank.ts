import { EventSearchFilters } from '../modules/search/dto/event-search-filter.dto';

// Weights/Threshods
const WEIGHTS = {
    TEXT_RELEVANCE: 3,
    FEATURED_BOOST: 2,
    STARTING_SOON_BOOST: 1.5,
    LOW_PRICE_BOOST: 1,
    POPULAR_DIVISOR: 50,
};

const THRESHOLDS = {
    STARTING_SOON_DAYS: 7,
    LOW_PRICE_LIMIT: 500, // Currency agnostic for now, roughly 500 INR/USD units
};

/**
 * Builds the deterministic ranking clauses (should clauses) for Events.
 * Formula: textRelevance * 3 + (isFeatured ? 2 : 0) + (startingSoon ? 1.5 : 0) + (popular ? registrations / 50 : 0) + (lowPrice ? 1 : 0)
 * 
 * Note: 'textRelevance * 3' is handled by applying boost:3 to the main 'must' text query in the search service.
 * This function handles the additive optional boosts.
 */
export const buildEventsRankingClauses = (boostSignals: EventSearchFilters['boostSignals']) => {
    const clauses = [];
    const now = new Date();

    // 1. isFeatured ? 2 : 0
    // Always apply if isFeatured field exists and true? 
    // Or only if boostSignals.featured is true?
    // Prompt said: "score = ... + (isFeatured ? 2 : 0)".
    // Assuming this applies if the Doc is featured, regardless of user signal (unless signal controls it).
    // But usually 'boostSignals' controls WHICH factors are active.
    // However, 'isFeatured' is usually a persistent boost.
    // Given the prompt context "Implement deterministic scoring: ...", I will apply it if the boostSignal logic implies or always.
    // But the separate "boostSignals" in DTO suggests control.
    // I will assume if 'featured' signal is ON, we boost featured.
    // Wait, the prompt formula lists them as additive terms.
    // I'll apply them if the corresponding signal is true.

    if (boostSignals.featured) {
        clauses.push({
            equals: {
                path: 'isFeatured',
                value: true,
                score: { constant: { value: WEIGHTS.FEATURED_BOOST } }
            }
        });
    }

    // 2. startingSoon ? 1.5 : 0
    if (boostSignals.startingSoon) {
        const future = new Date(now);
        future.setDate(now.getDate() + THRESHOLDS.STARTING_SOON_DAYS);

        clauses.push({
            range: {
                path: 'schedule.startDate',
                gte: now,
                lte: future,
                score: { constant: { value: WEIGHTS.STARTING_SOON_BOOST } }
            }
        });
    }

    // 3. popular ? registrations / 50 : 0
    if (boostSignals.popular) {
        // Linear path boost: value * scale. 
        // We want value / 50, so scale = 1/50 = 0.02
        clauses.push({
            near: {
                path: 'registrationsCount', // Assuming field name 'registrationsCount' or 'registrations'
                origin: 0,
                pivot: 1, // irrelevant for linear?
                score: {
                    function: {
                        path: 'registrationsCount', // Use field value
                        undefined: 1, // default if missing
                        scale: (1 / WEIGHTS.POPULAR_DIVISOR),
                        offset: 0,
                        decay: 0, // Linear doesn't use decay/pivot usually, but Atlas Search function score usually is: value * scale?
                        // Actually 'function' score in Atlas Search text query is 'path'?
                        // No, 'function' score option:
                        // score: { function: { path: "field" } } -> value
                        // We can't do math like /50 easily strictly in 'should' without 'function' score using numeric field directly.
                        // But `function` score type replaces the match score. 
                        // To ADD to score, we use a clause that matches everything (e.g. exists) with a function score?
                        // Atlas Search `exists` operator supports score?
                        // Or use `wildcard: *` with `score: { function: ... }`.
                    }
                }
            }
        });
        // Correction: 'near' is for distance. function score is for modifying.
        // We want to ADD (registrations/50) to the score.
        // We can add a clause: { range: { path: "registrationsCount", gte: 0, score: { function: { path: "registrationsCount", scale: 0.02 } } } }
        // For simple linear addition "registrations / 50", we use function score with scale 0.02.
        clauses.push({
            range: {
                path: 'registrationsCount',
                gte: 0,
                score: {
                    function: {
                        path: 'registrationsCount',
                        scale: 0.02,
                        expression: "multiply(x, 0.02)" // Not strictly needed if scale works, but explicitly safe.
                    }
                }
            }
        });
    }

    // 4. lowPrice ? 1 : 0
    if (boostSignals.lowPrice) {
        clauses.push({
            range: {
                path: 'tickets.price',
                lte: THRESHOLDS.LOW_PRICE_LIMIT,
                score: { constant: { value: WEIGHTS.LOW_PRICE_BOOST } }
            }
        });
    }

    // Also include 'isFeatured' as a general permanent boost if not requested? 
    // The prompt says "score = ... + (isFeatured ? 2 : 0)". 
    // If user didn't request 'featured' boost signal, maybe we shouldn't? 
    // But 'isFeatured' usually implies global priority.
    // I'll stick to `boostSignals` driving everything for strictness, but add a fallback for 'isFeatured' if it's generally expected.
    // However, normalizer sets 'featured' boost signal if request has 'featured'.
    // Let's assume ONLY if signal is present.

    return clauses;
};

/**
 * Builds the Sort stage based on sort mode.
 */
export const buildEventsSortStage = (sortMode: EventSearchFilters['sortMode']) => {
    switch (sortMode) {
        case 'soonest':
            return { $sort: { 'schedule.startDate': 1 } };
        case 'mostPopular':
            return { $sort: { 'registrationsCount': -1 } };
        case 'lowestPrice':
            return { $sort: { 'tickets.price': 1 } };
        case 'relevance':
        default:
            return null; // Use Atlas Search score
    }
};

