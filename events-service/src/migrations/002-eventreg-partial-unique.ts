/**
 * Migration 002 — EventRegistration partial unique index.
 *
 * The old index { eventId: 1, userId: 1 } was a full unique constraint,
 * blocking re-registration after cancel. New index is partial — uniqueness
 * only enforced for ACTIVE statuses (confirmed/attended/no-show/registered),
 * NOT cancelled.
 *
 * Run with: npx ts-node src/migrations/002-eventreg-partial-unique.ts
 *
 * Safe to re-run — checks the existing index shape before dropping.
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const OLD_INDEX_NAME = 'eventId_1_userId_1';
const NEW_PARTIAL_FILTER = {
    status: { $in: ['confirmed', 'attended', 'no-show', 'registered'] },
};

async function run() {
    const uri = process.env.EVENTS_MONGO_URI || process.env.MONGODB_URI;
    if (!uri) throw new Error('EVENTS_MONGO_URI (or MONGODB_URI) required');

    await mongoose.connect(uri);
    console.log('Connected.');

    const collection = mongoose.connection.db.collection('eventregistrations');
    const indexes = await collection.indexes();

    const existing = indexes.find((i) => i.name === OLD_INDEX_NAME);
    if (!existing) {
        console.log('No existing eventId_1_userId_1 index — nothing to drop.');
    } else if (existing.partialFilterExpression) {
        console.log('Existing index is already partial — no migration needed.');
        await mongoose.disconnect();
        return;
    } else {
        console.log('Dropping old full unique index...');
        await collection.dropIndex(OLD_INDEX_NAME);
        console.log('Dropped.');
    }

    console.log('Creating partial unique index...');
    await collection.createIndex(
        { eventId: 1, userId: 1 },
        {
            unique: true,
            partialFilterExpression: NEW_PARTIAL_FILTER,
            name: 'eventId_1_userId_1',
        }
    );
    console.log('Partial index created. Cancelled rows no longer block re-registration.');

    await mongoose.disconnect();
    console.log('Done.');
}

run().catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
});
