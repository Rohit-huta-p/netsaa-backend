import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(__dirname, '.env') });

import EventRegistration from './src/models/EventRegistration';

async function main() {
  await mongoose.connect(process.env.MONGO_URI as string);
  console.log("Connected");
  const regs = await EventRegistration.find().lean();
  console.log("Found registrations:", regs.map(r => ({ id: r._id, userId: r.userId, eventId: r.eventId, status: r.status })));
  process.exit(0);
}
main().catch(console.error);
