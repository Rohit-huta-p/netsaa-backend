import { buildGigsRankingClauses } from '../../../ranking/gigs.rank';
import { GigSearchHardFilters } from '../../../modules/search/dto/gig-search-filter.dto';
import { escapeRegex } from '../../../utils/escapeRegex';

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

    // NOTE: we deliberately do NOT hard-require applicationDeadline > now here.
    // applicationDeadline is OPTIONAL on the Gig model, and an Atlas `range`
    // filter skips documents missing the field — so this clause excluded EVERY
    // deadline-less gig from all search. Instead, buildGigsPipeline excludes
    // only gigs whose deadline is EXPLICITLY in the past, via compound.mustNot.

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

    // city — handled as a post-$search $match (case-insensitive any-of regex on
    // location.city) in buildGigsPipeline, mirroring the events getEvents fix.
    // Not an Atlas filter clause here: stored city is Title-Case while the board
    // sends lowercase slugs, and multi-city needs anchored case-insensitive OR.

    // remoteOnly (equals - boolean). The Gig model stores the flag at
    // location.isRemote (NOT a top-level remoteOnly), so the old path matched
    // nothing. FE keeps remote mutually exclusive with city.
    if (hardFilters.remoteOnly === true) {
        filterClauses.push({
            equals: {
                path: 'location.isRemote',
                value: true,
            },
        });
    }

    // Minimum compensation. A gig qualifies if ANY stated figure reaches the
    // floor: fixed `amount`, or a range's `maxAmount`/`minAmount`. The old clause
    // used only compensation.amount, so range gigs (amount unset) were dropped.
    // Purely-negotiable gigs with no figures still fall out (no number to compare).
    if (typeof hardFilters.minCompensation === 'number' && hardFilters.minCompensation > 0) {
        const floor = hardFilters.minCompensation;
        filterClauses.push({
            compound: {
                should: [
                    { range: { path: 'compensation.amount', gte: floor } },
                    { range: { path: 'compensation.maxAmount', gte: floor } },
                    { range: { path: 'compensation.minAmount', gte: floor } },
                ],
                minimumShouldMatch: 1,
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
    limit: number,
    viewerRole: 'client' | 'creative_lead' | 'artist' | 'admin' = 'artist'
) => {
    const rankingClauses = buildGigsRankingClauses(query);
    const filterClauses = buildGigsFilterClauses(hardFilters);

    // City — case-insensitive any-of match on the stored (Title-Case)
    // location.city. Applied as a post-$search $match (not an Atlas filter clause)
    // so it mirrors the events getEvents regex-$in fix and is robust to the
    // slug-vs-stored-case mismatch. The $facet $count below runs AFTER this stage,
    // so totals stay correct.
    const cities = hardFilters?.cities ?? [];
    const cityMatchStages =
        cities.length > 0
            ? [{ $match: { 'location.city': { $in: cities.map((c) => new RegExp(`^${escapeRegex(c)}$`, 'i')) } } }]
            : [];

    // Three-role wall (gigs only). Plain $match after $search — posterRole is
    // not in the Atlas index (same reason accountStatus was dropped from the
    // search MUST in 28455eb). Legacy unstamped gigs count as creative_lead posts.
    const wallStages =
        viewerRole === 'admin'
            ? []
            : viewerRole === 'creative_lead'
                ? [{ $match: { posterRole: 'client' } }]
                : viewerRole === 'client'
                    ? [{ $match: { _id: null } }] // clients browse own posts in gigs-service, not search
                    : [{ $match: { $or: [{ posterRole: 'creative_lead' }, { posterRole: { $exists: false } }] } }];

    const searchStage = {
        $search: {
            index: 'gigs_search_index',
            compound: {
                must: must,
                should: [...rankingClauses, ...should],
                filter: filterClauses,
                // Hide only gigs whose application deadline has EXPLICITLY passed.
                // `range` skips documents missing the field, so deadline-less gigs
                // (deadline is optional) are NOT excluded here — they stay visible.
                mustNot: [{ range: { path: 'applicationDeadline', lt: new Date() } }],
                minimumShouldMatch: (query && must.length === 0) ? 1 : 0
            },
            count: {
                type: 'total',
            },
        },
    };

    return [
        searchStage,
        ...wallStages,
        ...cityMatchStages,
        {
            $lookup: {
                from: 'users',
                localField: 'organizerId',
                foreignField: '_id',
                as: 'organizer'
            }
        },
        {
            $match: {
                'organizer.accountStatus': 'active'
            }
        },
        {
            $addFields: {
                score: { $meta: 'searchScore' },
                // Computed sort keys (consumed by buildGigsSortStage, spliced in
                // before $facet). _sortPay = the gig's top stated figure so range
                // gigs sort by their ceiling; _sortDate = publishedAt or, when a
                // published gig has none, createdAt. Both are optional on the Gig
                // model, so they're derived here rather than sorted on raw paths
                // that the $project below would drop. $max/$ifNull yield null when
                // nothing is set → those gigs sink to the bottom under DESC.
                _sortPay: {
                    $max: [
                        '$compensation.amount',
                        '$compensation.maxAmount',
                        '$compensation.minAmount',
                    ],
                },
                _sortDate: { $ifNull: ['$publishedAt', '$createdAt'] },
            },
        },
        {
            $project: {
                _id: 1,
                score: 1,
                _sortPay: 1,
                _sortDate: 1,
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
