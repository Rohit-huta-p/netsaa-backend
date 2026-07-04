jest.mock('../../config/mux', () => ({
  mux: { video: { uploads: { create: jest.fn().mockResolvedValue({ id: 'up_abc', url: 'https://storage.mux/upload' }) } } },
  MUX_ASSET_SETTINGS: { playback_policy: ['public'], video_quality: 'basic' },
  MAX_VIDEO_DURATION_SECONDS: 65,
  playbackUrl: (id: string) => `https://stream.mux.com/${id}.m3u8`,
  posterUrl: (id: string) => `https://image.mux.com/${id}/thumbnail.jpg?time=1`,
}));
jest.mock('../permission.service', () => ({
  checkUploadPermission: jest.fn().mockResolvedValue(undefined),
  PermissionError: class extends Error {},
}));

import { createVideoUpload } from '../video.service';
import { MediaAsset } from '../../models/MediaAsset';

describe('createVideoUpload', () => {
  it('creates a Mux upload and a waiting MediaAsset owned by the caller', async () => {
    const res = await createVideoUpload(
      { id: 'owner1', role: 'artist' } as any,
      { entityType: 'event', entityId: 'evt1', purpose: 'gallery' },
    );
    expect(res).toEqual({ uploadId: 'up_abc', uploadUrl: 'https://storage.mux/upload' });
    const rec = await MediaAsset.findOne({ uploadId: 'up_abc' });
    expect(rec?.status).toBe('waiting');
    expect(rec?.ownerId).toBe('owner1');
    expect(rec?.entityId).toBe('evt1');
  });
});
