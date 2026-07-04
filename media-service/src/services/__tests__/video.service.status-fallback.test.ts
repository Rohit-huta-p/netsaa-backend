const attachSpy = jest.fn().mockResolvedValue(undefined);
jest.mock('../attach.client', () => ({ attachToEvent: (...a: any[]) => attachSpy(...a) }));
jest.mock('../../config/mux', () => ({
  mux: {
    video: {
      uploads: { retrieve: jest.fn().mockResolvedValue({ asset_id: 'as_1' }) },
      assets: { retrieve: jest.fn().mockResolvedValue({ status: 'ready', duration: 10, aspect_ratio: '16:9', playback_ids: [{ id: 'pb_1' }] }) },
    },
  },
  MUX_ASSET_SETTINGS: {}, MAX_VIDEO_DURATION_SECONDS: 65,
  playbackUrl: (id: string) => `https://stream.mux.com/${id}.m3u8`,
  posterUrl: (id: string) => `https://image.mux.com/${id}/thumbnail.jpg?time=1`,
}));

import { getAssetStatus } from '../video.service';
import { MediaAsset } from '../../models/MediaAsset';

it('reconciles a still-processing asset from Mux when polled (no webhook needed)', async () => {
  await MediaAsset.create({ uploadId: 'up_1', entityType: 'event', entityId: 'evt1', purpose: 'gallery', ownerId: 'u1', status: 'waiting' });
  const res = await getAssetStatus({ id: 'u1', role: 'artist' } as any, 'up_1');
  expect(res?.status).toBe('ready');
  expect(res?.playbackId).toBe('pb_1');
  const rec = await MediaAsset.findOne({ uploadId: 'up_1' });
  expect(rec?.status).toBe('ready'); // persisted via the shared state machine
  expect(attachSpy).toHaveBeenCalledWith(expect.objectContaining({ eventId: 'evt1', playbackId: 'pb_1', status: 'ready' }));
});

it('returns null for a non-owner', async () => {
  await MediaAsset.create({ uploadId: 'up_2', entityType: 'event', entityId: 'evt2', purpose: 'gallery', ownerId: 'owner', status: 'waiting' });
  const res = await getAssetStatus({ id: 'someone-else', role: 'artist' } as any, 'up_2');
  expect(res).toBeNull();
});
