import { buildPeopleVisibility } from '../../permissions/people.visibility';

/**
 * Builds the Atlas Search filter clauses based on input DTO filters.
 */
export const buildPeopleFilters = (filters: Record<string, any>) => {
    const must: any[] = [];
    const should: any[] = [];

    // Get Mandatory Visibility Rules
    const { filter: visibilityFilter, mustNot: visibilityMustNot } = buildPeopleVisibility();

    const filter = [...visibilityFilter];
    const mustNot = [...(visibilityMustNot || [])];

    // --- User Filters ---

    // Artist Type
    if (filters.artistType) {
        must.push({
            text: {
                query: filters.artistType,
                path: 'artistType',
            },
        });
    }

    // City
    if (filters.city) {
        must.push({
            text: {
                query: filters.city,
                path: 'city',
            },
        });
    }

    // Rating
    if (filters.rating) {
        filter.push({
            range: {
                path: 'rating',
                gte: Number(filters.rating),
            },
        });
    }

    return { must, should, filter, mustNot };
};
