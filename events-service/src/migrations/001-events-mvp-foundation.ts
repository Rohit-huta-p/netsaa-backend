/**
 * Events MVP foundation migration. Run ONCE, pre-deploy.
 *
 * What it does:
 *  1. Verifies EventApplication has zero rows (NETSA pre-public). If >0, ABORTS.
 *  2. Drops the eventapplications collection.
 *  3. Seeds the EventTag collection with the 20 starter tags.
 *
 * Run with: npx ts-node src/migrations/001-events-mvp-foundation.ts
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import EventTag from '../models/EventTag';

dotenv.config();

const SEED_TAGS: { id: string; display: string }[] = [
    { id: 'workshop', display: 'Workshop' },
    { id: 'audition', display: 'Audition' },
    { id: 'showcase', display: 'Showcase' },
    { id: 'meetup', display: 'Meetup' },
    { id: 'class', display: 'Class' },
    { id: 'competition', display: 'Competition' },
    { id: 'masterclass', display: 'Masterclass' },
    { id: 'jam-session', display: 'Jam Session' },
    { id: 'theatre-lab', display: 'Theatre Lab' },
    { id: 'bootcamp', display: 'Bootcamp' },
    { id: 'networking', display: 'Networking' },
    { id: 'mixer', display: 'Mixer' },
    { id: 'open-mic', display: 'Open Mic' },
    { id: 'festival', display: 'Festival' },
    { id: 'conference', display: 'Conference' },
    { id: 'retreat', display: 'Retreat' },
    { id: 'intensive', display: 'Intensive' },
    { id: 'audition-prep', display: 'Audition Prep' },
    { id: 'qa', display: 'Q&A' },
    { id: 'choreography-lab', display: 'Choreography Lab' },
];

async function run() {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error('MONGODB_URI required');

    await mongoose.connect(uri);
    console.log('Connected.');

    // Step 1: defensive count of EventApplication
    const appCount = await mongoose.connection.db
        .collection('eventapplications')
        .countDocuments({});

    if (appCount > 0) {
        console.error(`ABORT: ${appCount} EventApplication rows exist. Manual review required.`);
        process.exit(1);
    }
    console.log('EventApplication: 0 rows. Safe to drop.');

    // Step 2: drop collection
    try {
        await mongoose.connection.db.dropCollection('eventapplications');
        console.log('Dropped eventapplications collection.');
    } catch (e: any) {
        if (e.code === 26) {
            console.log('Collection already missing — nothing to drop.');
        } else {
            throw e;
        }
    }

    // Step 3: seed EventTags
    let inserted = 0;
    for (const tag of SEED_TAGS) {
        const existing = await EventTag.findById(tag.id);
        if (existing) continue;

        await EventTag.create({
            _id: tag.id,
            displayName: tag.display,
            status: 'seed',
            usageCount: 0,
            createdBy: 'system',
            approvedAt: new Date(),
        });
        inserted++;
    }
    console.log(`Seeded ${inserted} new tags (${SEED_TAGS.length - inserted} already existed).`);

    await mongoose.disconnect();
    console.log('Done.');
}

run().catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
});
