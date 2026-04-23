/**
 * Test setup for gigs-service
 *
 * - Starts an ephemeral in-memory MongoDB via mongodb-memory-server.
 * - Connects mongoose to it before all tests.
 * - Clears all collections after every test (isolation).
 * - Disconnects + stops the server after all tests.
 * - Exposes `authTokenFor(userId, role)` which signs a JWT compatible with
 *   the gigs-service `protect` middleware (payload shape: { user: { id, role } }).
 */

import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import jwt from 'jsonwebtoken';

// Pin JWT secret BEFORE any app/route module loads so that auth middleware
// reads the same value at verify-time as we use at sign-time.
const TEST_JWT_SECRET = 'test_jwt_secret_gigs_service';
process.env.JWT_SECRET = TEST_JWT_SECRET;

let mongoServer: MongoMemoryServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);
});

afterEach(async () => {
  if (!mongoose.connection.db) return;
  const collections = await mongoose.connection.db.collections();
  for (const collection of collections) {
    await collection.deleteMany({});
  }
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongoServer) {
    await mongoServer.stop();
  }
});

/**
 * Sign a JWT matching the shape the `protect` middleware expects.
 * Usage: `.set('Authorization', \`Bearer ${authTokenFor(userId)}\`)`
 */
export const authTokenFor = (userId: string, role: 'artist' | 'organizer' | 'admin' = 'artist'): string => {
  return jwt.sign(
    { user: { id: userId, role } },
    process.env.JWT_SECRET as string,
    { expiresIn: '1h' }
  );
};
