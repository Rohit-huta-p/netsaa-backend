const mongoose = require('mongoose');
require('dotenv').config();

async function run() {
  await mongoose.connect(process.env.EVENTS_MONGO_URI);
  const EventRegistration = require('./src/models/EventRegistration').default;
  const count = await EventRegistration.countDocuments();
  console.log("Total registrations:", count);
  const regs = await EventRegistration.find().lean();
  console.log("Registrations:", JSON.stringify({
    count,
    data: regs.map(r => ({ id: r._id, userId: r.userId, eventId: r.eventId, status: r.status }))
  }, null, 2));
  process.exit(0);
}
run();
