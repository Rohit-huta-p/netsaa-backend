import { buildEventsVisibility } from '../../permissions/events.visibility';

/**
 * Builds the Atlas Search filter clauses for Events.
 * Enforces mandatory permissions via helper.
 */
export const buildEventsFilters = (filters: Record<string, any>) => {
    const must: any[] = [];
    const should: any[] = [];

    // Mandatory Permissions via Helper
    const { filter: visibilityFilter } = buildEventsVisibility();
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

    // Event Type
    if (filters.eventType) {
        must.push({
            text: {
                query: filters.eventType,
                path: 'eventType',
            },
        });
    }

    return { must, should, filter };
};
