import { peopleIndexer } from '../indexers/people.indexer';

/**
 * Event Handlers for User domain events.
 * Invoked by the messaging infrastructure (RabbitMQ/Kafka consumer).
 */
export const userConsumer = {
    handleUserCreated: async (payload: any) => {
        console.log('[Indexing] Processing UserCreated:', payload._id);
        await peopleIndexer.indexPerson(payload);
    },

    handleUserUpdated: async (payload: any) => {
        console.log('[Indexing] Processing UserUpdated:', payload._id);
        await peopleIndexer.indexPerson(payload);
    },

    handleUserDeleted: async (payload: { _id: string }) => {
        console.log('[Indexing] Processing UserDeleted:', payload._id);
        await peopleIndexer.deletePerson(payload._id);
    },
};
