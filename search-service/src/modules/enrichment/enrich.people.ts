import mongoose from 'mongoose';

/**
 * Enriches a list of People IDs with full document data and contextual status.
 */
export const enrichPeopleResults = async (originalIds: string[], viewerId?: string) => {
    if (originalIds.length === 0) return [];

    if (!mongoose.connection.db) {
        throw new Error('Database connection not established');
    }

    const objectIds = originalIds.map((id) => new mongoose.Types.ObjectId(id));

    // 1. Fetch Documents
    // Handle both ObjectId and String ID storage to be robust
    const queryIds = [
        ...objectIds,
        ...originalIds
    ];

    const docs = await mongoose.connection.db
        .collection('users')
        .find({ _id: { $in: queryIds as any } })
        .toArray();

    const docMap = new Map(docs.map((d) => [d._id.toString(), d]));

    console.log(`[enrich.people] debug: queried ${queryIds.length} ids, found ${docs.length} docs`);

    // 2. Map back to original order and attach context
    return originalIds
        .map((id) => {
            const doc = docMap.get(id.toString());
            if (!doc) return null;

            // Todo: Check connection status if viewerId is present
            const connectionStatus = 'none'; // 'connected' | 'pending' | 'none'

            return {
                ...doc,
                // _id is ObjectId, mapper expects string usually, but we keep it raw here for mapper to handle or toString it
                _id: doc._id,
                connectionStatus,
            };
        })
        .filter(Boolean);
};
