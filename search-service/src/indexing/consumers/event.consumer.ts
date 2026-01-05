import { eventsIndexer } from '../indexers/events.indexer';

/**
 * Event Handlers for Event domain events.
 */
export const eventConsumer = {
    handleEventCreated: async (payload: any) => {
        console.log('[Indexing] Processing EventCreated:', payload._id);
        await eventsIndexer.indexEvent(payload);
    },

    handleEventUpdated: async (payload: any) => {
        console.log('[Indexing] Processing EventUpdated:', payload._id);
        await eventsIndexer.indexEvent(payload);
    },

    handleEventDeleted: async (payload: { _id: string }) => {
        console.log('[Indexing] Processing EventDeleted:', payload._id);
        await eventsIndexer.deleteEvent(payload._id);
    },
};
