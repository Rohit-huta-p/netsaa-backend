import mongoose from 'mongoose';

/**
 * Enriches a list of Event IDs with full document data and contextual status.
 */
export const enrichEventsResults = async (originalIds: string[], viewerId?: string) => {
    if (originalIds.length === 0) return [];

    if (!mongoose.connection.db) {
        throw new Error('Database connection not established');
    }

    const objectIds = originalIds.map((id) => {
        try {
            return new mongoose.Types.ObjectId(id);
        } catch (e) {
            return null;
        }
    }).filter(id => id !== null);

    // Query for BOTH ObjectId and String versions of the ID to be safe
    const queryIds = [...objectIds, ...originalIds];

    // 1. Fetch Documents
    console.log('[enrichEventsResults] Enriching IDs:', originalIds);
    const docs = await mongoose.connection.db
        .collection('events')
        .find({ _id: { $in: queryIds as any[] } })
        .toArray();
    // console.log('[enrichEventsResults] Found Docs:', docs.length);
    console.log("[enrichEventsResults] docs", docs);
    if (docs.length === 0 && originalIds.length > 0) {
        console.log('[enrichEventsResults] WARNING: No docs found. Checking first ID type:', typeof originalIds[0]);
    }

    const docMap = new Map(docs.map((d) => [d._id.toString(), d]));

    // 2. Map back to original order and attach context
    return originalIds
        .map((id) => {
            const doc = docMap.get(id.toString());
            if (!doc) return null;

            // Todo: Check if saved/registered
            const isSaved = false;
            const registrationStatus = 'none'; // 'registered' | 'waitlisted' | 'none'

            return {
                ...doc,
                _id: doc._id,
                isSaved,
                registrationStatus,
            };
        })
        .filter(Boolean);
};
