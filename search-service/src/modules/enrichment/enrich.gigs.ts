import mongoose from 'mongoose';

/**
 * Enriches a list of Gig IDs with full document data and contextual status.
 */
export const enrichGigsResults = async (originalIds: string[], viewerId?: string) => {
    if (originalIds.length === 0) return [];

    if (!mongoose.connection.db) {
        throw new Error('Database connection not established');
    }

    const objectIds = originalIds.map((id) => new mongoose.Types.ObjectId(id));

    // 1. Fetch Documents
    const docs = await mongoose.connection.db
        .collection('gigs')
        .find({ _id: { $in: objectIds } })
        .toArray();

    // DEBUG: Log enrichment results
    console.log(`[Enrichment] Requested IDs: ${originalIds.length}, Found Docs: ${docs.length}`);
    if (docs.length === 0) console.log('[Enrichment] IDs:', originalIds);

    const docMap = new Map(docs.map((d) => [d._id.toString(), d]));

    // 2. Map back to original order and attach context
    return originalIds
        .map((id) => {
            const doc = docMap.get(id.toString());
            if (!doc) return null;

            // Todo: Check if saved/applied
            const isSaved = false;
            const isApplied = false;

            return {
                ...doc,
                _id: doc._id,
                isSaved,
                isApplied,
            };
        })
        .filter(Boolean);
};
