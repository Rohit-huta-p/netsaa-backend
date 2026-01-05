import mongoose from 'mongoose';

/**
 * Handles indexing operations for Events.
 */
export const eventsIndexer = {
    indexEvent: async (data: any) => {
        if (!mongoose.connection.db) {
            throw new Error('Database connection not established');
        }

        const { _id, ...updateData } = data;
        if (!_id) throw new Error('Cannot index event without _id');

        const id = typeof _id === 'string' ? new mongoose.Types.ObjectId(_id) : _id;

        await mongoose.connection.db.collection('events').updateOne(
            { _id: id },
            { $set: updateData },
            { upsert: true }
        );
    },

    deleteEvent: async (id: string) => {
        if (!mongoose.connection.db) return;
        const objectId = new mongoose.Types.ObjectId(id);
        await mongoose.connection.db.collection('events').deleteOne({ _id: objectId });
    },
};
