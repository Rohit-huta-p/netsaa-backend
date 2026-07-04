process.env.MUX_TOKEN_ID ||= 'test-mux-id';
process.env.MUX_TOKEN_SECRET ||= 'test-mux-secret';
process.env.MUX_WEBHOOK_SECRET ||= 'test-webhook-secret';
process.env.INTERNAL_SERVICE_TOKEN ||= 'test-internal-token';
process.env.MONGO_URI ||= 'mongodb://127.0.0.1:27017/test';
process.env.JWT_SECRET ||= 'test-jwt';
process.env.AWS_ACCESS_KEY_ID ||= 'x';
process.env.AWS_SECRET_ACCESS_KEY ||= 'x';
process.env.AWS_S3_BUCKET ||= 'test-bucket';

import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterEach(async () => {
  const { collections } = mongoose.connection;
  for (const key of Object.keys(collections)) await collections[key].deleteMany({});
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});
