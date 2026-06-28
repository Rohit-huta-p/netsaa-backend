/**
 * Schema migration · 2026-06-25 · Event flow expansion
 *
 * Backfills new fields on existing documents with sane defaults.
 * Adds idempotency keys to legacy registrations/reservations so the new
 * unique index can be created without conflicts.
 *
 * Run with:
 *   ts-node src/migrations/2026-06-25-event-flow-schema.ts
 *
 * SAFE TO RE-RUN (idempotent).
 * REQUIRES: MONGO_URI env var.
 */

import mongoose from 'mongoose';
import { randomBytes } from 'crypto';

import Event from '../models/Event';
import EventRegistration from '../models/EventRegistration';
import EventReservation from '../models/EventReservation';

const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
    console.error('✗ MONGO_URI env var required');
    process.exit(1);
}

const log = (msg: string) => console.log(`[migration] ${msg}`);

/** Generate a deterministic-ish idempotency key for legacy rows. */
const legacyIdempotencyKey = (id: mongoose.Types.ObjectId): string =>
    `legacy-${id.toString()}-${randomBytes(4).toString('hex')}`;

async function backfillEvents() {
    log('→ Event: backfilling new fields with defaults');
    const result = await Event.updateMany(
        {
            $or: [
                { waitlistAutoPromote: { $exists: false } },
                { walkupsAllowed: { $exists: false } },
                { maxGuestsPerRegistration: { $exists: false } },
                { requiredAttendeeFields: { $exists: false } },
                { visibility: { $exists: false } },
                { language: { $exists: false } },
                { discussionVisibility: { $exists: false } },
            ],
        },
        {
            $set: {
                waitlistAutoPromote: false,
                walkupsAllowed: false,
                maxGuestsPerRegistration: 5,
                requiredAttendeeFields: ['phone'],
                visibility: 'public',
                language: 'en',
                discussionVisibility: 'public',
            },
        }
    );
    log(`   matched=${result.matchedCount} modified=${result.modifiedCount}`);
}

async function backfillRegistrations() {
    log('→ EventRegistration: backfilling idempotencyKey + defaults');

    // 1. Add defaults that don't conflict with the unique index
    const defaultsResult = await EventRegistration.updateMany(
        {
            $or: [
                { visibility: { $exists: false } },
                { source: { $exists: false } },
                { tags: { $exists: false } },
            ],
        },
        {
            $set: {
                visibility: 'public',
                source: 'standard',
                tags: [],
            },
        }
    );
    log(`   defaults matched=${defaultsResult.matchedCount} modified=${defaultsResult.modifiedCount}`);

    // 2. Backfill idempotencyKey on rows missing it — one at a time so each gets unique key
    const missingKey = await EventRegistration.find({ idempotencyKey: { $exists: false } }).select('_id');
    log(`   ${missingKey.length} legacy registrations need idempotencyKey`);
    for (const doc of missingKey) {
        await EventRegistration.updateOne(
            { _id: doc._id },
            { $set: { idempotencyKey: legacyIdempotencyKey(doc._id as mongoose.Types.ObjectId) } }
        );
    }
    log(`   ✓ backfilled ${missingKey.length} idempotencyKey values`);
}

async function backfillReservations() {
    log('→ EventReservation: backfilling idempotencyKey');
    const missingKey = await EventReservation.find({ idempotencyKey: { $exists: false } }).select('_id');
    log(`   ${missingKey.length} legacy reservations need idempotencyKey`);
    for (const doc of missingKey) {
        await EventReservation.updateOne(
            { _id: doc._id },
            { $set: { idempotencyKey: legacyIdempotencyKey(doc._id as mongoose.Types.ObjectId) } }
        );
    }
    log(`   ✓ backfilled ${missingKey.length} idempotencyKey values`);
}

// NOTE: flagOnlineEvents() was removed 2026-06-26 — decision D7 reversed, online events are
// supported again. If a prior run of this migration flipped online/hybrid events to
// visibility='private', restore them with:
//   db.events.updateMany({ 'location.type': { $in: ['online','hybrid'] }, visibility: 'private' }, { $set: { visibility: 'public' } })
// (only if the organizer hadn't independently set them private).

async function ensureIndexes() {
    log('→ Building new indexes');
    await Event.syncIndexes();
    await EventRegistration.syncIndexes();
    await EventReservation.syncIndexes();
    log('   ✓ indexes synced');
}

async function main() {
    log(`Connecting to MongoDB...`);
    await mongoose.connect(MONGO_URI!);
    log(`✓ Connected`);

    try {
        await backfillEvents();
        await backfillRegistrations();
        await backfillReservations();
        await ensureIndexes();
        log('✓ Migration complete');
    } catch (err) {
        console.error('✗ Migration failed:', err);
        process.exitCode = 1;
    } finally {
        await mongoose.disconnect();
        log('Disconnected');
    }
}

main();
