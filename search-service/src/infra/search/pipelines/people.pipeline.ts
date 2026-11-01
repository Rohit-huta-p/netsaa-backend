// search-service/src/infra/search/pipelines/people.pipeline.ts

import { ObjectId } from 'mongodb';
import mongoose from 'mongoose';
import { buildPeopleRankingClausesV2 } from '../../../ranking/people.rank.v2';
import type { ViewerGraph } from '../../../people/viewer-graph';
import { buildPeopleFilters } from '../../../modules/people/people.filters';

interface BuildPeoplePipelineArgs {
    query: string;
    filters?: {
        city?: string;
        role?: 'artist' | 'organizer' | 'creative_lead' | 'client';
        featuredOnly?: boolean;
    };
    limit: number;
    skip: number;
    /** Viewer's own user id — excluded from results so you never match yourself. */
    viewerId?: string;
}

export function buildPeoplePipeline({
    query,
    filters,
    limit,
    skip,
    viewerId
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

    // Role filter — OPTIONAL. The network/people search is open to every role
    // (the three-role wall is gigs-only), so only narrow by role when the caller
    // explicitly asks for one. No role → all roles. Legacy 'organizer' maps to
    // the renamed 'creative_lead'.
    // Use 'text' instead of 'equals' because dynamic mapping indexes strings as text, not tokens.
    // (accountStatus filter removed — field is not in the Atlas Search index, so the clause
    //  always returned 0 matches. `blocked=false` covers deactivated/deleted accounts via
    //  the existing soft-delete + block flow.)
    const requestedRole = filters?.role === 'organizer' ? 'creative_lead' : filters?.role;
    if (requestedRole) {
        mustClauses.push({
            text: {
                path: 'role',
                query: requestedRole
            }
        });
    }

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
     * Self-exclusion
     * ------------------------------- */

    // Never return the searcher's own account. NOTE: a compound.mustNot `equals`
    // on `_id` does NOT work under the dynamic people_search_index (`_id` isn't
    // queryable via `equals` there — it silently matches nothing), so exclude the
    // viewer with a normal `$match` on the real ObjectId after `$search` instead.
    // `total` for people search is the returned-row count, so the self row drops
    // out of the count too.
    const selfExclusionStages: any[] = [];
    if (viewerId) {
        let valueForId: any = viewerId;
        try { valueForId = new mongoose.Types.ObjectId(viewerId); } catch { /* fall back to string */ }
        selfExclusionStages.push({ $match: { _id: { $ne: valueForId } } });
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

        // Exclude the viewer's own account (see note above).
        ...selfExclusionStages,

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

    // Role filter — OPTIONAL (network search is open to all roles). Only narrow
    // when a role is explicitly requested; legacy 'organizer' → 'creative_lead'.
    const requestedRole = filters?.role === 'organizer' ? 'creative_lead' : filters?.role;
    const roleClause = requestedRole ? [{ text: { path: 'role', query: requestedRole } }] : [];

    const finalMustNot = [...(mustNot || [])];

    // Self-exclusion: `equals` on `_id` does not work under the dynamic index
    // (silently matches nothing), so exclude the viewer with a post-`$search`
    // `$match` on the real ObjectId instead.
    const selfExclusionStages: any[] = [];
    if (viewer._id) {
        let valueForId: any = viewer._id;
        try { valueForId = new mongoose.Types.ObjectId(viewer._id); } catch { /* fall back to string */ }
        selfExclusionStages.push({ $match: { _id: { $ne: valueForId } } });
    }

    return [
        {
            $search: {
                index: 'people_search_index',
                compound: {
                    must: [
                        { equals: { path: 'blocked', value: false } },
                        ...roleClause,
                        ...must,
                    ],
                    should,
                    filter,
                    mustNot: finalMustNot,
                    minimumShouldMatch: should.length > 0 ? 1 : 0,
                },
            },
        },
        ...selfExclusionStages,
        { $addFields: { _score: { $meta: 'searchScore' } } },
        { $sort: { _score: -1, 'cached.averageRating': -1 } },
        { $skip: skip },
        { $limit: limit },
        { $project: { email: 0, phoneNumber: 0, passwordHash: 0, otp: 0, devices: 0 } },
    ];
}
