/**
 * Schema migration · 2026-07-02 · Walk-up guest support
 *
 * Swaps EventRegistration's unique {eventId,userId} index for the partial one
 * (userId optional for walk-up guests) and rebuilds EventTicket indexes.
 * syncIndexes() drops indexes absent from the schema and creates the schema's.
 *
 * Run with:  ts-node src/migrations/2026-07-02-walkup-userid-optional.ts
 * SAFE TO RE-RUN (idempotent). REQUIRES: MONGO_URI env var.
 */
import mongoose from 'mongoose';
import EventRegistration from '../models/EventRegistration';
import EventTicket from '../models/EventTicket';

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) { console.error('✗ MONGO_URI env var required'); process.exit(1); }
const log = (m: string) => console.log(`[migration] ${m}`);

async function main() {
  log('Connecting to MongoDB...');
  await mongoose.connect(MONGO_URI!);
  log('✓ Connected');
  try {
    log('→ Rebuilding EventRegistration indexes (unique → partial on userId)');
    await EventRegistration.syncIndexes();
    log('→ Rebuilding EventTicket indexes');
    await EventTicket.syncIndexes();
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
