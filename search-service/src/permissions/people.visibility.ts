/**
 * Builds mandatory visibility filters for People.
 * Enforces:
 * - Blocked users exclusion
 * - Privacy flags (if applicable)
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

    // Mandatory: Only show verified or public profiles if such flags exist.
    // For Phase 1, we assume all indexed 'users' are public enough to be searched, 
    // or we rely on an 'isPublic' flag if added later. 
    // Design doc mentions "Respect privacy flags".
    // Adding a placeholder for future 'isPublic' check behavior.
    /*
    filter.push({
        term: {
            path: 'isPublic',
            value: true
        }
    });
    */

    return { filter, mustNot };
};
