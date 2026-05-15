/**
 * Destructive: wipes all event-related collections and user-side event fields.
 *
 * Authorized one-time reset for local dev. DO NOT run in prod.
 *
 *   cd events-service && npx ts-node scripts/nuke-events.ts
 */
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

const COLLECTIONS_TO_DROP = [
    'events',
    'eventregistrations',
    'eventreservations',
    'eventauditlogs',
    'eventcomments',
    'eventstats',
    'eventtags',
    'eventtickets',
    'eventtickettypes',
    'savedevents',
];

async function main() {
    const uri = process.env.EVENTS_MONGO_URI || process.env.MONGODB_URI;
    if (!uri) {
        console.error('EVENTS_MONGO_URI not set');
        process.exit(1);
    }

    console.log('Connecting...');
    await mongoose.connect(uri);
    const db = mongoose.connection.db;
    if (!db) throw new Error('No db handle');

    const dbName = db.databaseName;
    console.log(`Connected to db: ${dbName}`);

    const existing = (await db.listCollections().toArray()).map((c) => c.name);
    console.log(`Existing collections (${existing.length}):`, existing.sort().join(', '));

    // Drop event collections
    let dropped = 0;
    for (const name of COLLECTIONS_TO_DROP) {
        if (existing.includes(name)) {
            const count = await db.collection(name).countDocuments();
            await db.collection(name).drop();
            console.log(`  dropped ${name} (${count} docs)`);
            dropped++;
        } else {
            console.log(`  skip ${name} (not present)`);
        }
    }

    // Clear event-related fields on users
    if (existing.includes('users')) {
        const userUpdate = await db.collection('users').updateMany(
            {},
            {
                $unset: {
                    savedEvents: '',
                    followingOrganizers: '',
                    eventReminders: '',
                    eventInterests: '',
                },
            }
        );
        console.log(`  cleared event fields on users: ${userUpdate.modifiedCount} modified`);
    }

    // Clear event-related inapp notifications (where entityType === 'event')
    if (existing.includes('inappnotifications')) {
        const notifResult = await db.collection('inappnotifications').deleteMany({
            $or: [
                { entityType: 'event' },
                { subtype: { $regex: /^event\./ } },
            ],
        });
        console.log(`  deleted event notifications: ${notifResult.deletedCount}`);
    }

    // Same for the legacy notifications collection if present
    if (existing.includes('notifications')) {
        const notifResult = await db.collection('notifications').deleteMany({
            $or: [
                { entityType: 'event' },
                { subtype: { $regex: /^event\./ } },
                { type: { $regex: /^event\./ } },
            ],
        });
        console.log(`  deleted from notifications: ${notifResult.deletedCount}`);
    }

    console.log(`\nDone. Dropped ${dropped} collections + cleared user/notif event refs.`);
    await mongoose.disconnect();
    process.exit(0);
}

main().catch((err) => {
    console.error('FAILED:', err);
    process.exit(1);
});
