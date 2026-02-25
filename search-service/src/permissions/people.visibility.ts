/**
 * Builds mandatory visibility filters for People.
 * Enforces:
 * - Blocked users exclusion
 * - Privacy flags (profileVisibility setting)
 */
export const buildPeopleVisibility = (context: { blockedUserIds?: string[] } = {}) => {
    const filter: any[] = [];
    const mustNot: any[] = [];

    // Exclude blocked users
    if (context.blockedUserIds && context.blockedUserIds.length > 0) {
        mustNot.push({
            in: {
                path: '_id',
                value: context.blockedUserIds, // Assumes _id is stored as ObjectId or string in Atlas
            },
        });
    }

    // Exclude private profiles from search results.
    // Users without a settings field default to 'public' at the schema level,
    // so only explicitly-set 'private' profiles are excluded.
    mustNot.push({
        text: {
            path: 'settings.privacy.profileVisibility',
            query: 'private',
        },
    });

    return { filter, mustNot };
};
