import { buildGigsRankingClauses } from '../../../ranking/gigs.rank';

/**
 * Builds the Atlas Search pipeline for Gigs.
 * Returns only _id and score.
 */
export const buildGigsPipeline = (
    query: string,
    must: any[],
    should: any[],
    filter: any[],
    skip: number,
    limit: number
) => {
    const rankingClauses = buildGigsRankingClauses(query);

    const searchStage = {
        $search: {
            index: 'gigs_search_index',
            compound: {
                must: must,
                should: [...rankingClauses, ...should],
                filter: filter,
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
