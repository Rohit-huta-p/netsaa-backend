import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { SimilarArtists } from '../similar/similar.model';

let mongo: MongoMemoryServer;
beforeAll(async () => { mongo = await MongoMemoryServer.create(); await mongoose.connect(mongo.getUri()); });
afterAll(async () => { await mongoose.disconnect(); await mongo.stop(); });
afterEach(async () => { await SimilarArtists.deleteMany({}); });

describe('SimilarArtists model', () => {
  it('persists a similar artists doc', async () => {
    const artistId = new mongoose.Types.ObjectId();
    await SimilarArtists.create({
      artistId,
      list: [{
        peerId: new mongoose.Types.ObjectId(),
        score: 0.5,
        reasons: ['craft'],
        craftOverlap: 1,
        skillOverlap: 0,
        cityMatch: true,
      }],
      computedAt: new Date(),
    });
    const found = await SimilarArtists.findOne({ artistId });
    expect(found?.list).toHaveLength(1);
    expect(found?.list[0].cityMatch).toBe(true);
  });

  it('enforces unique artistId', async () => {
    const artistId = new mongoose.Types.ObjectId();
    await SimilarArtists.create({ artistId, list: [], computedAt: new Date() });
    await expect(
      SimilarArtists.create({ artistId, list: [], computedAt: new Date() })
    ).rejects.toThrow();
  });
});
