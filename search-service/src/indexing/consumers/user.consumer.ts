import { peopleIndexer } from '../indexers/people.indexer';
import { similarRecomputeQueue } from '../../workers/similar.recompute.queue';

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

// Fields whose change warrants recomputing this artist's similarity list.
const SIMILAR_RELEVANT_FIELDS = new Set([
    'artistType',
    'skills',
    'cached.primaryCity',
    'languages',
    'bio',
]);

/**
 * Enqueue a similarity recompute whenever profile fields that drive
 * craft / skill / city matching are changed.
 */
export async function onProfileUpdated(payload: { userId: string; changedFields: string[] }): Promise<void> {
    const relevant = payload.changedFields.some(f => SIMILAR_RELEVANT_FIELDS.has(f));
    if (relevant) {
        await similarRecomputeQueue.add('similar.recompute', { artistId: payload.userId });
    }
}
