jest.mock('../../config/mux', () => ({
  mux: {},
  MUX_ASSET_SETTINGS: {}, MAX_VIDEO_DURATION_SECONDS: 65,
  playbackUrl: (id: string) => `https://stream.mux.com/${id}.m3u8`,
  posterUrl: (id: string) => `https://image.mux.com/${id}/thumbnail.jpg?time=1`,
}));
const attachSpy = jest.fn().mockResolvedValue(undefined);
jest.mock('../attach.client', () => ({ attachToEvent: (...a: any[]) => attachSpy(...a) }));

import { applyMuxEvent } from '../video.service';
import { MediaAsset } from '../../models/MediaAsset';

const seed = () => MediaAsset.create({
  uploadId: 'up_1', entityType: 'event', entityId: 'evt1', purpose: 'gallery',
  ownerId: 'u1', status: 'waiting',
});

describe('applyMuxEvent', () => {
  it('asset_created then ready → attaches playbackId, is forward-only + idempotent', async () => {
    await seed();
    await applyMuxEvent({ type: 'video.upload.asset_created', data: { id: 'up_1', asset_id: 'as_1' } });
    await applyMuxEvent({ type: 'video.asset.ready', data: { id: 'as_1', upload_id: 'up_1', duration: 12.4, aspect_ratio: '16:9', playback_ids: [{ id: 'pb_1', policy: 'public' }] } });

    const rec = await MediaAsset.findOne({ uploadId: 'up_1' });
    expect(rec?.status).toBe('ready');
    expect(rec?.playbackId).toBe('pb_1');
    expect(attachSpy).toHaveBeenCalledWith(expect.objectContaining({ eventId: 'evt1', uploadId: 'up_1', playbackId: 'pb_1', status: 'ready' }));

    // Idempotent / forward-only: a late asset_created must not regress status.
    await applyMuxEvent({ type: 'video.upload.asset_created', data: { id: 'up_1', asset_id: 'as_1' } });
    expect((await MediaAsset.findOne({ uploadId: 'up_1' }))?.status).toBe('ready');
  });

  it('over-cap duration → errored, no attach as ready', async () => {
    await seed();
    attachSpy.mockClear();
    await applyMuxEvent({ type: 'video.asset.ready', data: { id: 'as_2', upload_id: 'up_1', duration: 120, aspect_ratio: '16:9', playback_ids: [{ id: 'pb_2' }] } });
    const rec = await MediaAsset.findOne({ uploadId: 'up_1' });
    expect(rec?.status).toBe('errored');
    expect(attachSpy).toHaveBeenCalledWith(expect.objectContaining({ status: 'errored' }));
  });

  it('does NOT push to events-service for a user (profile) asset', async () => {
    attachSpy.mockClear();
    await MediaAsset.create({ uploadId: 'up_u', entityType: 'user', entityId: 'u1', purpose: 'portfolio', ownerId: 'u1', status: 'waiting' });
    await applyMuxEvent({ type: 'video.asset.ready', data: { id: 'as_u', upload_id: 'up_u', duration: 10, aspect_ratio: '9:16', playback_ids: [{ id: 'pb_u' }] } });
    const rec = await MediaAsset.findOne({ uploadId: 'up_u' });
    expect(rec?.status).toBe('ready');
    expect(rec?.playbackId).toBe('pb_u');
    expect(attachSpy).not.toHaveBeenCalled();
  });
});
