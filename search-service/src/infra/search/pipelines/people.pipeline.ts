// search-service/src/infra/search/pipelines/people.pipeline.ts

import { ObjectId } from 'mongodb';

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
