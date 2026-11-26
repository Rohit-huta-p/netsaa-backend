import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

// The event-waitlist concept ships OFF (see waitlistEnabled()). Tests opt IN globally so
// the existing waitlist suites keep exercising the code paths; the flag-off behaviour has
// its own dedicated test (waitlistDisabled.integration.test.ts).
process.env.EVENTS_WAITLIST_ENABLED = '1';

let mongo: MongoMemoryServer;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
});

afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key of Object.keys(collections)) {
    await collections[key].deleteMany({});
  }
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});
