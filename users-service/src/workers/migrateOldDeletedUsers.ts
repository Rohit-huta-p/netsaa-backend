// src/workers/migrateOldDeletedUsers.ts
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/User';

dotenv.config();

const migrateOldDeletedUsers = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/netsa');
        console.log('[Migration] Connected to MongoDB');

        // Target legacy soft-deleted users missing the new tombstone email format
        const users = await User.find({
            deletedAt: { $exists: true, $ne: null },
            originalEmail: { $exists: false },
            email: { $not: /^deleted_/ },
            accountStatus: { $ne: 'active' }, // Safety check
            $or: [
                { accountStatus: { $ne: 'scheduled_for_deletion' } },
                { accountStatus: { $exists: false } }
            ]
        });

        console.log(`[Migration] Found ${users.length} old deleted users to migrate.`);

        let migratedCount = 0;
        const affectedUserIds: string[] = [];

        for (const user of users) {
            try {
                // Determine tombstone email
                const tombstoneEmail = `deleted_${user._id}_${Date.now()}@deleted.netsa`;

                // Update user document
                user.originalEmail = user.email;
                user.email = tombstoneEmail;
                user.accountStatus = 'permanently_deleted';

                // Save to trigger Mongoose validation but this is a migration so we rely on schema defaults
                await user.save({ validateModifiedOnly: true });

                affectedUserIds.push(user._id.toString());
                migratedCount++;
            } catch (err) {
                console.error(`[Migration] Failed to migrate user ${user._id}:`, err);
            }
        }

        console.log(`[Migration] Successfully migrated ${migratedCount} users.`);
        if (affectedUserIds.length > 0) {
            console.log(`[Migration] Affected User IDs:`, affectedUserIds);
        }

        process.exit(0);
    } catch (error) {
        console.error('[Migration] Fatal error:', error);
        process.exit(1);
    }
};

migrateOldDeletedUsers();
