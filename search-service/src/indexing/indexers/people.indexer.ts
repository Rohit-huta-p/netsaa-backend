import mongoose from 'mongoose';

/**
 * Handles indexing operations for People (Users).
 * Direct writes to the 'users' collection to keep Atlas Search index fresh.
 */
export const peopleIndexer = {
    indexPerson: async (data: any) => {
        if (!mongoose.connection.db) {
            throw new Error('Database connection not established');
        }

        // Assumes data has _id. Upsert to create or replace.
        const { _id, ...updateData } = data;
        if (!_id) throw new Error('Cannot index person without _id');

        const id = typeof _id === 'string' ? new mongoose.Types.ObjectId(_id) : _id;

        await mongoose.connection.db.collection('users').updateOne(
            { _id: id },
            { $set: updateData },
            { upsert: true }
        );
    },

    deletePerson: async (id: string) => {
        if (!mongoose.connection.db) return;
        const objectId = new mongoose.Types.ObjectId(id);
        await mongoose.connection.db.collection('users').deleteOne({ _id: objectId });
    },
};
