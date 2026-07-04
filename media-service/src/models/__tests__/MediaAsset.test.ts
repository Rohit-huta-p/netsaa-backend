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

  // Guards the entityType widening: the schema enum must accept the full EntityType
  // union (not just 'event'), or a non-event upload would throw a ValidationError at
  // create() despite passing checkUploadPermission. (Phase-2 surfaces: gig/artist video.)
  it('accepts non-event entity types across the full EntityType union', async () => {
    const gig = await MediaAsset.create({
      uploadId: 'up_gig', entityType: 'gig', entityId: 'g1', purpose: 'gallery',
      ownerId: 'u1', status: 'waiting',
    });
    expect(gig.entityType).toBe('gig');

    const artist = await MediaAsset.create({
      uploadId: 'up_artist', entityType: 'artist', entityId: 'a1', purpose: 'portfolio',
      ownerId: 'u2', status: 'waiting',
    });
    expect(artist.entityType).toBe('artist');
  });
});
