/**
 * Gig Search Filters DTO
 *
 * Accepts raw frontend filter payload and normalizes into:
 * - hardFilters: Strict matching criteria
 * - boostSignals: Ranking boosters for relevance scoring
 * - sortMode: Result ordering preference
 *
 * No Mongo/Atlas/DB logic - pure data transfer object
 */

export interface GigSearchHardFilters {
    artistTypes?: string[];
    experienceLevel?: string[];
    gigType?: string[];
    category?: string[];
    city?: string;
    remoteOnly?: boolean;
    minCompensation?: number;
    compensationModel?: string[];
    applicationDeadlineBefore?: Date;
    perks?: string[];
}

export interface GigSearchBoostSignals {
    urgent?: boolean;
    featured?: boolean;
    higherPay?: boolean;
    deadlineSoon?: boolean;
}

export type GigSearchSortMode = 'relevance' | 'newest' | 'highestPay';

export interface GigSearchFilters {
    hardFilters?: GigSearchHardFilters;
    boostSignals?: GigSearchBoostSignals;
    sortMode?: GigSearchSortMode;
}

/**
 * Raw frontend filter payload DTO
 * Used to accept and normalize incoming filter requests
 */
export interface GigSearchFilterPayload {
    // Hard filter fields (direct from frontend)
    artistTypes?: string[];
    experienceLevel?: string[];
    gigType?: string[];
    category?: string[];
    city?: string;
    remoteOnly?: boolean;
    minCompensation?: number;
    compensationModel?: string[];
    applicationDeadlineBefore?: string | Date;
    perks?: string[];

    // Boost signals
    urgent?: boolean;
    featured?: boolean;
    higherPay?: boolean;
    deadlineSoon?: boolean;

    // Sort mode
    sortMode?: GigSearchSortMode;
}

/**
 * Normalizes raw frontend payload into structured GigSearchFilters
 */
export function normalizeGigSearchFilters(
    payload: GigSearchFilterPayload
): GigSearchFilters {
    const {
        artistTypes,
        experienceLevel,
        gigType,
        category,
        city,
        remoteOnly,
        minCompensation,
        compensationModel,
        applicationDeadlineBefore,
        perks,
        urgent,
        featured,
        higherPay,
        deadlineSoon,
        sortMode,
    } = payload;

    return {
        hardFilters: {
            artistTypes,
            experienceLevel,
            gigType,
            category,
            city,
            remoteOnly,
            minCompensation,
            compensationModel,
            applicationDeadlineBefore: applicationDeadlineBefore
                ? new Date(applicationDeadlineBefore)
                : undefined,
            perks,
        },
        boostSignals: {
            urgent,
            featured,
            higherPay,
            deadlineSoon,
        },
        sortMode: sortMode ?? 'relevance',
    };
}
