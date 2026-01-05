import { gigsIndexer } from '../indexers/gigs.indexer';

/**
 * Event Handlers for Gig domain events.
 */
export const gigConsumer = {
    handleGigCreated: async (payload: any) => {
        console.log('[Indexing] Processing GigCreated:', payload._id);
        await gigsIndexer.indexGig(payload);
    },

    handleGigUpdated: async (payload: any) => {
        console.log('[Indexing] Processing GigUpdated:', payload._id);
        await gigsIndexer.indexGig(payload);
    },

    handleGigDeleted: async (payload: { _id: string }) => {
        console.log('[Indexing] Processing GigDeleted:', payload._id);
        await gigsIndexer.deleteGig(payload._id);
    },
};
