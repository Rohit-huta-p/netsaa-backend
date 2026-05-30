// search-service/src/infra/search/pipelines/people.pipeline.ts

import { ObjectId } from 'mongodb';
import { buildPeopleRankingClausesV2 } from '../../../ranking/people.rank.v2';
import type { ViewerGraph } from '../../../people/viewer-graph';
import { buildPeopleFilters } from '../../../modules/people/people.filters';

interface BuildPeoplePipelineArgs {
    query: string;
    filters?: {
        city?: string;
        role?: 'artist' | 'organizer';
        featuredOnly?: boolean;
    };
    limit: number;
    skip: number;
}

export function buildPeoplePipeline({
    query,
    filters,
    limit,
    skip
}: BuildPeoplePipelineArgs) {
    const shouldClauses: any[] = [];
    const mustClauses: any[] = [];

    /* -------------------------------
     * Hard filters (visibility & role)
     * ------------------------------- */

    // Never show blocked users
    mustClauses.push({
        equals: {
            path: 'blocked',
            value: false
        }
    });

    // Only show active accounts
    mustClauses.push({
        text: {
            path: 'accountStatus',
            query: 'active'
        }
    });

    // Role filter (default = artist search)
    // Role filter (default = artist search)
    // Use 'text' instead of 'equals' because dynamic mapping indexes strings as text, not tokens.
    mustClauses.push({
        text: {
            path: 'role',
            query: filters?.role ?? 'artist'
        }
    });

    /* -------------------------------
     * Text relevance
     * ------------------------------- */

    if (query?.trim()) {
        // Primary identity match (autocomplete)
        shouldClauses.push({
            autocomplete: {
                query,
                path: 'displayName',
            }

        });

        // Secondary semantic matches
        shouldClauses.push({
            text: {
                query,
                path: [
                    'artistType',
                    'skills',
                    'experience',
                    'location',
                    'instagramHandle'
                ],
                score: { boost: { value: 1.5 } }
            }
        });
    }

    /* -------------------------------
     * Optional filters
     * ------------------------------- */

    if (filters?.city) {
        mustClauses.push({
            equals: {
                path: 'cached.primaryCity',
                value: filters.city
            }
        });
    }

    if (filters?.featuredOnly) {
        mustClauses.push({
            equals: {
                path: 'cached.featured',
                value: true
            }
        });
    }

    /* -------------------------------
     * Final pipeline
     * ------------------------------- */

    return [
        {
            $search: {
                index: 'people_search_index',
                compound: {
                    must: mustClauses,
                    should: shouldClauses,
                    minimumShouldMatch: shouldClauses.length > 0 ? 1 : 0
                }
            }
        },

        // Ranking tie-breakers
        {
            $addFields: {
                _score: { $meta: 'searchScore' }
            }
        },

        { $sort: { _score: -1, 'cached.averageRating': -1 } },

        { $skip: skip },
        { $limit: limit },

        // Return only what frontend needs
        {
            $project: {
                email: 0,
                phoneNumber: 0,
                otp: 0,
                otpExpires: 0,
                devices: 0,
                passwordHash: 0
            }
        }
    ];
}

export interface BuildPipelineV2Args {
    query: string;
    filters: Record<string, any>;
    limit: number;
    skip: number;
    viewer: { _id?: string; graph: ViewerGraph };
}

export function buildPeoplePipelineV2(args: BuildPipelineV2Args) {
    const { query, filters, limit, skip, viewer } = args;
    const { must, filter, mustNot } = buildPeopleFilters(filters);

    const should = buildPeopleRankingClausesV2(query, viewer.graph);

    const finalMustNot = [...(mustNot || [])];
    if (viewer._id) {
        finalMustNot.push({ equals: { path: '_id', value: viewer._id } });
    }

    return [
        {
            $search: {
                index: 'people_search_index',
                compound: {
                    must: [
                        { equals: { path: 'blocked', value: false } },
                        { text: { path: 'role', query: filters?.role ?? 'artist' } },
                        ...must,
                    ],
                    should,
                    filter,
                    mustNot: finalMustNot,
                    minimumShouldMatch: should.length > 0 ? 1 : 0,
                },
            },
        },
        { $addFields: { _score: { $meta: 'searchScore' } } },
        { $sort: { _score: -1, 'cached.averageRating': -1 } },
        { $skip: skip },
        { $limit: limit },
        { $project: { email: 0, phoneNumber: 0, passwordHash: 0, otp: 0, devices: 0 } },
    ];
}
