/**
 * Smoke test — proves jest + ts-jest + in-memory Mongo infrastructure is wired up.
 */

import mongoose from 'mongoose';

describe('gigs-service test infra', () => {
  it('connects to in-memory Mongo', async () => {
    expect(mongoose.connection.readyState).toBe(1); // 1 = connected
    const collections = await mongoose.connection.db!.listCollections().toArray();
    expect(Array.isArray(collections)).toBe(true);
  });
});
