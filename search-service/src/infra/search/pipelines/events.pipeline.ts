/**
 * Builds the Atlas Search pipeline for Events.
 * Returns only _id and score.
 */
export const buildEventsPipeline = (
    query: string,
    must: any[],
    should: any[],
    hardFilters: Record<string, any>,
    skip: number,
    limit: number
): any[] => {
    // Ranking clauses are now passed in 'should'

    // --- Build Filter Clauses ---
    const filterClauses: any[] = [];

    // 1. Mandatory Filters
    // status = published
    // filterClauses.push({
    //     term: {
    //         query: 'published',
    //         path: 'status'
    //     }
    // });

    // schedule.startDate >= now
    // filterClauses.push({
    //     range: {
    //         path: 'schedule.startDate',
    //         gte: new Date()
    //     }
    // });

    // 2. Conditional Filters

    // eventType (Array -> terms)
    if (hardFilters.eventType && hardFilters.eventType.length > 0) {
        filterClauses.push({
            in: {
                path: 'eventType',
                value: hardFilters.eventType
            }
        });
    }

    // category (Array -> terms)
    if (hardFilters.category && hardFilters.category.length > 0) {
        filterClauses.push({
            in: {
                path: 'category',
                value: hardFilters.category
            }
        });
    }

    // skillLevel (Array -> terms)
    if (hardFilters.skillLevel && hardFilters.skillLevel.length > 0) {
        filterClauses.push({
            in: {
                path: 'skillLevel',
                value: hardFilters.skillLevel
            }
        });
    }

    // eligibleArtistTypes (Array -> terms)
    if (hardFilters.eligibleArtistTypes && hardFilters.eligibleArtistTypes.length > 0) {
        filterClauses.push({
            in: {
                path: 'eligibleArtistTypes',
                value: hardFilters.eligibleArtistTypes
            }
        });
    }

    // location.type
    if (hardFilters.locationType) {
        filterClauses.push({
            text: {
                query: hardFilters.locationType,
                path: 'location.type'
            }
        });
    }

    // location.city
    if (hardFilters.city) {
        filterClauses.push({
            text: {
                query: hardFilters.city,
                path: 'location.city'
            }
        });
    }

    // Date Ranges
    if (hardFilters.startDateAfter || hardFilters.startDateBefore) {
        const range: any = { path: 'schedule.startDate' };
        if (hardFilters.startDateAfter) range.gte = hardFilters.startDateAfter;
        if (hardFilters.startDateBefore) range.lt = hardFilters.startDateBefore;
        filterClauses.push({ range });
    }

    if (hardFilters.registrationDeadlineBefore) {
        filterClauses.push({
            range: {
                path: 'registrationDeadline',
                lt: hardFilters.registrationDeadlineBefore
            }
        });
    }

    // 3. Ticket-based Filters
    // maxPrice
    if (hardFilters.maxPrice !== undefined) {
        filterClauses.push({
            range: {
                path: 'ticketPrice',
                lte: hardFilters.maxPrice
            }
        });
    }

    // refundableOnly
    if (hardFilters.refundableOnly) {
        filterClauses.push({
            equals: {
                path: 'tickets.refundable',
                value: true
            }
        });
    }

    // Check if we have any clauses. If not, use wildcard to match all documents.
    if (must.length === 0 && should.length === 0 && filterClauses.length === 0) {
        must.push({
            wildcard: {
                query: '*',
                path: { wildcard: '*' },
                allowAnalyzedField: true
            }
        });
    }

    const searchStage = {
        $search: {
            index: 'events_search_index',
            compound: {
                must: must,
                should: should, // Passed directly
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
