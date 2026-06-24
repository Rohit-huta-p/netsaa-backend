/**
 * One-time migration (2026-06 client onboarding): the unique index on
 * users.email was created as non-sparse; phone-only clients (no email)
 * would collide on null. Rebuild as { unique, sparse }.
 * Run: npx ts-node src/workers/migrateEmailSparseIndex.ts
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const migrate = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/netsa');
        const col = mongoose.connection.db!.collection('users');
        const indexes = await col.indexes();
        const emailIdx = indexes.find((i) => i.key && i.key.email === 1);
        if (emailIdx && !emailIdx.sparse) {
            await col.dropIndex(emailIdx.name!);
            console.log(`[Migration] Dropped non-sparse index ${emailIdx.name}`);
        }
        await col.createIndex({ email: 1 }, { unique: true, sparse: true });
        console.log('[Migration] Created { email: 1 } unique sparse index');

        // Phone uniqueness (2026-06 fix): OTP signup races could create duplicate
        // accounts per phone. Audit for existing dupes first — fail loudly if found.
        const dupes = await col.aggregate([
            { $match: { phoneNumber: { $type: 'string', $ne: '' } } },
            { $group: { _id: '$phoneNumber', n: { $sum: 1 } } },
            { $match: { n: { $gt: 1 } } },
        ]).toArray();
        if (dupes.length > 0) {
            console.error('[Migration] DUPLICATE phone numbers found — resolve manually before unique index:', JSON.stringify(dupes));
            process.exit(1);
        }
        const phoneIdx = (await col.indexes()).find((i) => i.key && i.key.phoneNumber === 1);
        if (phoneIdx && !(phoneIdx.unique && phoneIdx.sparse)) {
            await col.dropIndex(phoneIdx.name!);
            console.log(`[Migration] Dropped non-unique phone index ${phoneIdx.name}`);
        }
        await col.createIndex({ phoneNumber: 1 }, { unique: true, sparse: true });
        console.log('[Migration] Created { phoneNumber: 1 } unique sparse index');
        process.exit(0);
    } catch (error) {
        console.error('[Migration] Fatal error:', error);
        process.exit(1);
    }
};

migrate();
