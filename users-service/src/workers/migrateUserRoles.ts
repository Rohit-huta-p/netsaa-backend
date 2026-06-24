/**
 * One-time migration (2026-06 three-role model):
 *   - users who posted gigs OR registered with hire intent OR completed a
 *     hirer profile -> creative_lead (preserves their posts' visibility to artists)
 *   - everyone else -> artist
 * Idempotent: only touches docs where role is missing.
 *
 * Run: npx ts-node src/workers/migrateUserRoles.ts
 * Requires MONGO_URI (users db). GIGS_MONGO_URI optional (falls back to MONGO_URI).
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/User';

dotenv.config();

const migrateUserRoles = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/netsa');
        console.log('[Migration] Connected to users MongoDB');

        // Distinct organizerIds from the gigs db — these users have POSTED, so they lead.
        const gigsConn = await mongoose
            .createConnection(process.env.GIGS_MONGO_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/netsa')
            .asPromise();
        const organizerIds: any[] = await gigsConn.db!.collection('gigs').distinct('organizerId');
        console.log(`[Migration] ${organizerIds.length} distinct gig posters found`);

        const leads = await User.updateMany(
            {
                role: { $exists: false },
                $or: [
                    { _id: { $in: organizerIds } },
                    { intent: 'hire_artists' },
                    { 'contexts.hirer.profileComplete': true },
                ],
            },
            { $set: { role: 'creative_lead', roleChangedAt: new Date() } }
        );
        console.log(`[Migration] ${leads.modifiedCount} users -> creative_lead`);

        const artists = await User.updateMany(
            { role: { $exists: false } },
            { $set: { role: 'artist', roleChangedAt: new Date() } }
        );
        console.log(`[Migration] ${artists.modifiedCount} users -> artist`);

        await gigsConn.close();
        process.exit(0);
    } catch (error) {
        console.error('[Migration] Fatal error:', error);
        process.exit(1);
    }
};

migrateUserRoles();
