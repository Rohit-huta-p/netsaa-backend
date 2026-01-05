/**
 * Builds mandatory visibility filters for Events.
 * Enforces:
 * - Status = 'published'
 */
export const buildEventsVisibility = () => {
    const filter: any[] = [];

    // 1. Status must be 'published'
    filter.push({
        text: {
            query: 'published',
            path: 'status',
        },
    });

    // Events might also have expiry (startDate > now?), 
    // but "Past Events" search might be a feature.
    // Design doc only enforces 'status = published' for Phase 1.

    return { filter };
};
