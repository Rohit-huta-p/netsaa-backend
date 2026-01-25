import { buildGigsVisibility } from '../../permissions/gigs.visibility';
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

    // Category (ignore empty arrays)
    if (Array.isArray(rawFilters.category) && rawFilters.category.length > 0) {
        hardFilters.category = rawFilters.category;
    }

    // City (ignore if 'any')
    if (rawFilters.city && rawFilters.city !== 'any') {
        hardFilters.city = rawFilters.city;
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

/**
 * Builds the Atlas Search filter clauses for Gigs.
 * Enforces mandatory permissions via helper.
 */
export const buildGigsFilters = (filters: Record<string, any>) => {
    const must: any[] = [];
    const should: any[] = [];

    // Mandatory Permissions via Helper
    const { filter: visibilityFilter } = buildGigsVisibility();
    const filter = [...visibilityFilter];

    // --- User Filters ---

    // City
    if (filters.city) {
        must.push({
            text: {
                query: filters.city,
                path: 'city',
            },
        });
    }

    // Artist Type
    if (filters.artistType) {
        must.push({
            text: {
                query: filters.artistType,
                path: 'artistType',
            },
        });
    }

    return { must, should, filter };
};
