// src/workers/migrateAccountStatus.ts
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/User';

dotenv.config();

const migrateAccountStatus = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/netsa');
        console.log('[Migration] Connected to MongoDB');

        // Target active-state users missing the new `accountStatus` field.
        // We explicitly ignore those who are already marked as blocked or soft-deleted
        const result = await User.updateMany(
            {
                accountStatus: { $exists: false },
                blocked: { $ne: true },
                deletedAt: null // or { $exists: false } / null depending on schema nullability
            },
            { $set: { accountStatus: 'active' } }
        );

        console.log(`[Migration] Successfully migrated ${result.modifiedCount} active users.`);
        process.exit(0);
    } catch (error) {
        console.error('[Migration] Fatal error:', error);
        process.exit(1);
    }
};

migrateAccountStatus();
