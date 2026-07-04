import { MediaAsset } from '../MediaAsset';

describe('MediaAsset', () => {
  it('persists a waiting record and enforces uploadId uniqueness', async () => {
    await MediaAsset.init(); // ensure the unique index on uploadId is built before the dupe insert
    await MediaAsset.create({
      uploadId: 'up_1', entityType: 'event', entityId: 'e1', purpose: 'gallery',
      ownerId: 'u1', status: 'waiting',
    });
    const found = await MediaAsset.findOne({ uploadId: 'up_1' });
    expect(found?.status).toBe('waiting');
    await expect(
      MediaAsset.create({
        uploadId: 'up_1', entityType: 'event', entityId: 'e1', purpose: 'gallery',
        ownerId: 'u1', status: 'waiting',
      }),
    ).rejects.toThrow();
  });
});
