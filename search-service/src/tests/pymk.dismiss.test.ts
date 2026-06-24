import { dismissArtist } from '../pymk/pymk.dismiss';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

jest.mock('../cache/cache.service', () => ({
  cacheService: {
    del: jest.fn().mockResolvedValue(undefined),
    get: jest.fn(),
    set: jest.fn(),
  },
}));

let mongo: MongoMemoryServer;
beforeAll(async () => { mongo = await MongoMemoryServer.create(); await mongoose.connect(mongo.getUri()); });
afterAll(async () => { await mongoose.disconnect(); await mongo.stop(); });
afterEach(async () => { await mongoose.connection.collection('users').deleteMany({}); });

describe('dismissArtist', () => {
  it('appends artistId to users.pymk_dismissed at position 0 (LRU)', async () => {
    const viewerId = new mongoose.Types.ObjectId();
    const artistId = new mongoose.Types.ObjectId();
    await mongoose.connection.collection('users').insertOne({ _id: viewerId, pymk_dismissed: [] });
    await dismissArtist(viewerId.toString(), artistId.toString());
    const u = await mongoose.connection.collection('users').findOne({ _id: viewerId });
    expect(u?.pymk_dismissed?.[0].toString()).toBe(artistId.toString());
  });

  it('caps dismissed list at 200 (most recent kept)', async () => {
    const viewerId = new mongoose.Types.ObjectId();
    const existing = Array(200).fill(0).map(() => new mongoose.Types.ObjectId());
    await mongoose.connection.collection('users').insertOne({ _id: viewerId, pymk_dismissed: existing });
    const newArtist = new mongoose.Types.ObjectId();
    await dismissArtist(viewerId.toString(), newArtist.toString());
    const u = await mongoose.connection.collection('users').findOne({ _id: viewerId });
    expect(u?.pymk_dismissed).toHaveLength(200);
    expect(u?.pymk_dismissed?.[0].toString()).toBe(newArtist.toString()); // newest at front
  });

  it('invalidates cache keys after dismiss', async () => {
    const { cacheService } = require('../cache/cache.service');
    cacheService.del.mockClear();
    const viewerId = new mongoose.Types.ObjectId();
    const artistId = new mongoose.Types.ObjectId();
    await mongoose.connection.collection('users').insertOne({ _id: viewerId, pymk_dismissed: [] });
    await dismissArtist(viewerId.toString(), artistId.toString());
    expect(cacheService.del).toHaveBeenCalled();
  });
});
