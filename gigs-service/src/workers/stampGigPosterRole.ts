/**
 * One-time migration (2026-06 three-role model): every pre-existing gig was
 * posted by what is now a creative_lead. Stamp them so wall filters are exact.
 * (Wall filters also treat missing posterRole as creative_lead, so this is a
 * correctness backstop, not a launch blocker.)
 * Idempotent.
 *
 * Run: npx ts-node src/workers/stampGigPosterRole.ts
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Gig from '../models/Gig';

dotenv.config();

const stampGigPosterRole = async () => {
    try {
        await mongoose.connect(process.env.GIGS_MONGO_URI || 'mongodb://localhost:27017/netsa');
        console.log('[Migration] Connected to gigs MongoDB');

        const result = await Gig.updateMany(
            { posterRole: { $exists: false } },
            { $set: { posterRole: 'creative_lead' } }
        );
        console.log(`[Migration] Stamped ${result.modifiedCount} gigs as creative_lead posts`);
        process.exit(0);
    } catch (error) {
        console.error('[Migration] Fatal error:', error);
        process.exit(1);
    }
};

stampGigPosterRole();
