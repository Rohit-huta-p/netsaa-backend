import { buildGigsRankingClauses } from '../../../ranking/gigs.rank';
import { GigSearchHardFilters } from '../../../modules/search/dto/gig-search-filter.dto';

/**
 * Builds the compound.filter clauses for Gigs Atlas Search.
 *
 * Applies mandatory filters:
 * - status = 'published'
 * - expiresAt > now
 *
 * Plus user-defined hard filters:
 * - artistTypes (terms)
 * - experienceLevel (terms)
 * - gigType (terms)
 * - category (terms)
 * - city (text)
 * - remoteOnly (equals)
 * - compensation.amount >= minCompensation (range)
 *
 * All filters are ANDed together.
 * No ranking logic applied here.
 */
export function buildGigsFilterClauses(hardFilters?: GigSearchHardFilters): any[] {
    const filterClauses: any[] = [];

    // --- Mandatory Filters ---

    // status = 'published'
    // Using 'text' instead of 'equals' to support both keyword and standard analyzers
    filterClauses.push({
        text: {
            path: 'status',
            query: 'published',
        },
    });

    // applicationDeadline > now (gig still accepting applications)
    filterClauses.push({
        range: {
            path: 'applicationDeadline',
            gt: new Date(),
        },
    });

    // --- User Hard Filters ---

    if (!hardFilters) {
        return filterClauses;
    }

    // artistTypes (terms - array match)
    if (hardFilters.artistTypes && hardFilters.artistTypes.length > 0) {
        filterClauses.push({
            queryString: {
                defaultPath: 'artistTypes',
                query: hardFilters.artistTypes.map((t) => `"${t}"`).join(' OR '),
            },
        });
    }

    // experienceLevel (terms - array match)
    if (hardFilters.experienceLevel && hardFilters.experienceLevel.length > 0) {
        filterClauses.push({
            queryString: {
                defaultPath: 'experienceLevel',
                query: hardFilters.experienceLevel.map((e) => `"${e}"`).join(' OR '),
            },
        });
    }

    // gigType (terms - array match)
    if (hardFilters.gigType && hardFilters.gigType.length > 0) {
        filterClauses.push({
            queryString: {
                defaultPath: 'gigType',
                query: hardFilters.gigType.map((g) => `"${g}"`).join(' OR '),
            },
        });
    }

    // category (terms - array match)
    if (hardFilters.category && hardFilters.category.length > 0) {
        filterClauses.push({
            queryString: {
                defaultPath: 'category',
                query: hardFilters.category.map((c) => `"${c}"`).join(' OR '),
            },
        });
    }

    // city (text match - single value)
    if (hardFilters.city) {
        filterClauses.push({
            text: {
                path: 'city',
                query: hardFilters.city,
            },
        });
    }

    // remoteOnly (equals - boolean)
    if (hardFilters.remoteOnly === true) {
        filterClauses.push({
            equals: {
                path: 'remoteOnly',
                value: true,
            },
        });
    }

    // compensation.amount >= minCompensation (range)
    if (typeof hardFilters.minCompensation === 'number' && hardFilters.minCompensation > 0) {
        filterClauses.push({
            range: {
                path: 'compensation.amount',
                gte: hardFilters.minCompensation,
            },
        });
    }

    // compensationModel (terms - array match)
    if (hardFilters.compensationModel && hardFilters.compensationModel.length > 0) {
        filterClauses.push({
            queryString: {
                defaultPath: 'compensation.model',
                query: hardFilters.compensationModel.map((m) => `"${m}"`).join(' OR '),
            },
        });
    }

    // applicationDeadlineBefore (range - date)
    if (hardFilters.applicationDeadlineBefore) {
        filterClauses.push({
            range: {
                path: 'applicationDeadline',
                lte: hardFilters.applicationDeadlineBefore,
            },
        });
    }

    // perks (terms - array match)
    if (hardFilters.perks && hardFilters.perks.length > 0) {
        filterClauses.push({
            queryString: {
                defaultPath: 'perks',
                query: hardFilters.perks.map((p) => `"${p}"`).join(' OR '),
            },
        });
    }

    return filterClauses;
}

/**
 * Builds the Atlas Search pipeline for Gigs.
 * Returns only _id and score.
 *
 * @param query - Search query string
 * @param must - Must clauses (text search)
 * @param should - Should clauses (boosting)
 * @param hardFilters - Normalized hard filters from GigSearchFilters
 * @param skip - Pagination offset
 * @param limit - Pagination limit
 */
export const buildGigsPipeline = (
    query: string,
    must: any[],
    should: any[],
    hardFilters: GigSearchHardFilters | undefined,
    skip: number,
    limit: number
) => {
    const rankingClauses = buildGigsRankingClauses(query);
    const filterClauses = buildGigsFilterClauses(hardFilters);

    const searchStage = {
        $search: {
            index: 'gigs_search_index',
            compound: {
                must: must,
                should: [...rankingClauses, ...should],
                filter: filterClauses,
                minimumShouldMatch: (query && must.length === 0) ? 1 : 0
            },
            count: {
                type: 'total',
            },
        },
    };

    return [
        searchStage,
        {
            $addFields: {
                score: { $meta: 'searchScore' },
            },
        },
        {
            $project: {
                _id: 1,
                score: 1,
            },
        },
        {
            $facet: {
                metadata: [{ $count: 'total' }],
                data: [{ $skip: skip }, { $limit: limit }],
            },
        },
    ];
};
