/**
 * Builds mandatory visibility filters for Gigs.
 * Enforces:
 * - Status = 'published'
 * - ExpiresAt > Now
 */
export const buildGigsVisibility = () => {
    const filter: any[] = [];

    // 1. Status must be 'published'
    filter.push({
        text: {
            query: 'published',
            path: 'status',
        },
    });

    // 2. Not Expired (expiresAt > now)
    filter.push({
        range: {
            path: 'expiresAt',
            gt: new Date(),
        },
    });

    return { filter };
};
