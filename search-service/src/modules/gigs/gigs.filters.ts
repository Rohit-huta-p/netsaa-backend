import {
    GigSearchFilters,
    GigSearchHardFilters,
    GigSearchBoostSignals,
    GigSearchSortMode,
} from '../search/dto/gig-search-filter.dto';

/**
 * Normalizes raw frontend filter payload into structured GigSearchFilters.
 *
 * Rules:
 * - excludeUnpaid === true → minCompensation = 2000
 * - applicationDeadline: '3days' | '7days' | '14days' → calculated date
 * - city = 'any' → ignored
 * - Empty arrays → ignored
 * - remoteOnly === true → hard filter
 * - Sorting: relevance (default), newest, highestPay
 *
 * No database logic - pure normalization.
 */
export function normalizeGigFilters(rawFilters: any): GigSearchFilters {
    const hardFilters: GigSearchHardFilters = {};
    const boostSignals: GigSearchBoostSignals = {};
    let sortMode: GigSearchSortMode = 'relevance';

    // --- Hard Filters ---

    // Artist Types (ignore empty arrays)
    if (Array.isArray(rawFilters.artistTypes) && rawFilters.artistTypes.length > 0) {
        hardFilters.artistTypes = rawFilters.artistTypes;
    }

    // Experience Level (ignore empty arrays)
    if (Array.isArray(rawFilters.experienceLevel) && rawFilters.experienceLevel.length > 0) {
        hardFilters.experienceLevel = rawFilters.experienceLevel;
    }

    // Gig Type (ignore empty arrays)
    if (Array.isArray(rawFilters.gigType) && rawFilters.gigType.length > 0) {
        hardFilters.gigType = rawFilters.gigType;
    }

    // City — accept a comma-separated multi-city string ("pune,mumbai") or an
    // array. Split → trimmed, non-empty, dropping the 'any'/'remote' sentinels.
    // Stored as cities[] and applied downstream as a case-insensitive any-of
    // match on location.city (mirrors the events getEvents fix). 'remote' is
    // handled via remoteOnly, not here.
    const rawCity = rawFilters.cities ?? rawFilters.city;
    if (rawCity != null && rawCity !== 'any') {
        const cities = (Array.isArray(rawCity) ? rawCity : String(rawCity).split(','))
            .map((c: any) => String(c).trim())
            .filter((c: string) => c && c.toLowerCase() !== 'any' && c.toLowerCase() !== 'remote');
        if (cities.length) hardFilters.cities = cities;
    }

    // Remote Only
    if (rawFilters.remoteOnly === true) {
        hardFilters.remoteOnly = true;
    }

    // Minimum Compensation (excludeUnpaid → 2000)
    if (rawFilters.excludeUnpaid === true) {
        hardFilters.minCompensation = 2000;
    } else if (typeof rawFilters.minCompensation === 'number' && rawFilters.minCompensation > 0) {
        hardFilters.minCompensation = rawFilters.minCompensation;
    }

    // Compensation Model (ignore empty arrays)
    if (Array.isArray(rawFilters.compensationModel) && rawFilters.compensationModel.length > 0) {
        hardFilters.compensationModel = rawFilters.compensationModel;
    }

    // Application Deadline (3days, 7days, 14days)
    if (rawFilters.applicationDeadline) {
        const now = new Date();
        let deadlineDate: Date | undefined;

        switch (rawFilters.applicationDeadline) {
            case '3days':
                deadlineDate = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
                break;
            case '7days':
                deadlineDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
                break;
            case '14days':
                deadlineDate = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
                break;
            default:
                // If it's already a date string or Date object, parse it
                if (rawFilters.applicationDeadline instanceof Date) {
                    deadlineDate = rawFilters.applicationDeadline;
                } else if (typeof rawFilters.applicationDeadline === 'string') {
                    const parsed = new Date(rawFilters.applicationDeadline);
                    if (!isNaN(parsed.getTime())) {
                        deadlineDate = parsed;
                    }
                }
        }

        if (deadlineDate) {
            hardFilters.applicationDeadlineBefore = deadlineDate;
        }
    }

    // Perks (ignore empty arrays)
    if (Array.isArray(rawFilters.perks) && rawFilters.perks.length > 0) {
        hardFilters.perks = rawFilters.perks;
    }

    // --- Boost Signals ---

    if (rawFilters.urgent === true) {
        boostSignals.urgent = true;
    }

    if (rawFilters.featured === true) {
        boostSignals.featured = true;
    }

    if (rawFilters.higherPay === true) {
        boostSignals.higherPay = true;
    }

    if (rawFilters.deadlineSoon === true) {
        boostSignals.deadlineSoon = true;
    }

    // --- Sort Mode ---
    // relevance → default
    // newest → boost publishedAt
    // highestPay → boost compensation.amount

    if (rawFilters.sortMode === 'newest' || rawFilters.sortBy === 'newest') {
        sortMode = 'newest';
    } else if (rawFilters.sortMode === 'highestPay' || rawFilters.sortBy === 'highestPay') {
        sortMode = 'highestPay';
    } else {
        sortMode = 'relevance';
    }

    return {
        hardFilters,
        boostSignals,
        sortMode,
    };
}

// NOTE: a second, dead `buildGigsFilters` once lived here (it applied only city
// as a top-level `text` path:'city' plus artistType). It was never imported —
// the live filter builder is `buildGigsFilterClauses` in
// infra/search/pipelines/gigs.pipeline.ts. Removed to kill the trap of "fixing"
// the wrong builder (which already reads location.city / experienceLevel /
// minCompensation / remoteOnly).
