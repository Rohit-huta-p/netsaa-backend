/**
 * List all pending_payment registrations with their razorpayOrderId.
 * Used to manually fire webhook in localhost dev (no public URL for Razorpay).
 */
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

async function main() {
    const uri = process.env.EVENTS_MONGO_URI || process.env.MONGODB_URI;
    if (!uri) {
        console.error('EVENTS_MONGO_URI not set');
        process.exit(1);
    }

    await mongoose.connect(uri);
    const db = mongoose.connection.db;
    if (!db) throw new Error('No db handle');

    const rows = await db
        .collection('eventregistrations')
        .find({ status: 'pending_payment', paymentStatus: 'pending' })
        .toArray();

    console.log(`Found ${rows.length} pending_payment row(s):\n`);
    for (const r of rows) {
        console.log(`  _id: ${r._id}`);
        console.log(`  eventId: ${r.eventId}`);
        console.log(`  userId: ${r.userId}`);
        console.log(`  attendeeName: ${r.attendeeName}`);
        console.log(`  razorpayOrderId: ${r.razorpayOrderId}`);
        console.log(`  paidAmount: ${r.paidAmount} (rupees)`);
        console.log(`  attendeeCount: ${r.attendeeCount}`);
        console.log(`  createdAt: ${r.createdAt ?? r.registeredAt}`);
        console.log('');
    }

    await mongoose.disconnect();
    process.exit(0);
}

main().catch((err) => {
    console.error('FAILED:', err);
    process.exit(1);
});
