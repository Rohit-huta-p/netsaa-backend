import { buildGigsVisibility } from '../../permissions/gigs.visibility';

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
