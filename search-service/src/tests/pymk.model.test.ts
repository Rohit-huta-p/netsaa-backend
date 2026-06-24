import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { PymkRecommendation } from '../pymk/pymk.model';

let mongo: MongoMemoryServer;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});
afterEach(async () => {
  await PymkRecommendation.deleteMany({});
});

describe('PymkRecommendation model', () => {
  it('persists a recommendation doc', async () => {
    const userId = new mongoose.Types.ObjectId();
    await PymkRecommendation.create({
      userId,
      strategy: 'graph',
      list: [{
        artistId: new mongoose.Types.ObjectId(),
        score: 0.8,
        reasons: ['mutual'],
        mutualCount: 1,
        craftOverlap: 0,
      }],
      computedAt: new Date(),
      version: 1,
    });
    const found = await PymkRecommendation.findOne({ userId });
    expect(found?.list).toHaveLength(1);
    expect(found?.strategy).toBe('graph');
  });

  it('enforces unique userId', async () => {
    const userId = new mongoose.Types.ObjectId();
    await PymkRecommendation.create({ userId, strategy: 'graph', list: [], computedAt: new Date(), version: 1 });
    await expect(
      PymkRecommendation.create({ userId, strategy: 'graph', list: [], computedAt: new Date(), version: 1 })
    ).rejects.toThrow();
  });

  it('rejects invalid strategy enum', async () => {
    const userId = new mongoose.Types.ObjectId();
    await expect(
      PymkRecommendation.create({ userId, strategy: 'foobar' as any, list: [], computedAt: new Date(), version: 1 })
    ).rejects.toThrow();
  });
});
