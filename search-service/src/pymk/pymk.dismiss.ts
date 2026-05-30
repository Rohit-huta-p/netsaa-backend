import mongoose from 'mongoose';
import { cacheService } from '../cache/cache.service';

const CAP = 200;
const CACHE_PAGES_TO_INVALIDATE = 5;

export async function dismissArtist(viewerId: string, artistId: string): Promise<void> {
  const usersColl = mongoose.connection.collection('users');
  const aid = new mongoose.Types.ObjectId(artistId);
  const vid = new mongoose.Types.ObjectId(viewerId);

  await usersColl.updateOne(
    { _id: vid },
    {
      $push: {
        pymk_dismissed: {
          $each: [aid],
          $position: 0,
          $slice: CAP,
        } as any,
      },
    },
  );

  // Invalidate likely cached PYMK pages for this viewer.
  // Pattern delete isn't supported by all ioredis configs, so we proactively delete top N pages.
  for (let p = 1; p <= CACHE_PAGES_TO_INVALIDATE; p++) {
    await cacheService.del(`pymk:${viewerId}:page${p}`);
  }
}
