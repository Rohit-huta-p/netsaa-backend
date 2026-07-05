import { AuthUser } from '../middleware/auth';
import { mux, MUX_ASSET_SETTINGS, MAX_VIDEO_DURATION_SECONDS } from '../config/mux';
import { MediaAsset, MediaAssetStatus } from '../models/MediaAsset';
import { checkUploadPermission } from './permission.service';
import { Purpose } from '../utils/mime';
import { EntityType } from '../utils/fileKey';
import { attachToEvent } from './attach.client';

export interface CreateVideoUploadInput {
  entityType: EntityType;
  entityId: string;
  purpose: Purpose;
}

export async function createVideoUpload(user: AuthUser, input: CreateVideoUploadInput) {
  const { entityType, entityId, purpose } = input;

  // Reuse the existing ownership + purpose↔entity checks (owner = organizerId === user.id).
  await checkUploadPermission({ user, entityType, entityId, purpose });

  const upload = await mux.video.uploads.create({
    cors_origin: '*',
    new_asset_settings: { ...MUX_ASSET_SETTINGS },
  });

  await MediaAsset.create({
    uploadId: upload.id,
    entityType,
    entityId,
    purpose,
    ownerId: user.id,
    status: 'waiting',
    playbackPolicy: 'public',
  });

  return { uploadId: upload.id, uploadUrl: upload.url };
}

export async function getAssetStatus(user: AuthUser, uploadId: string) {
  let rec = await MediaAsset.findOne({ uploadId });
  if (!rec) return null;
  if (rec.ownerId !== user.id && user.role !== 'admin') return null; // owner-scoped

  // Fallback: if not terminal, reconcile straight from Mux (no webhook needed).
  // Drives the same idempotent applyMuxEvent state machine (forward-only, duration
  // cap, events-service attach). Silently ignores Mux errors — the client keeps polling.
  if (rec.status !== 'ready' && rec.status !== 'errored') {
    try {
      const upload = await mux.video.uploads.retrieve(uploadId);
      const assetId = upload.asset_id;
      if (assetId) {
        const asset = await mux.video.assets.retrieve(assetId);
        if (asset.status === 'ready') {
          await applyMuxEvent({ type: 'video.asset.ready', data: { id: assetId, upload_id: uploadId, duration: asset.duration, aspect_ratio: asset.aspect_ratio, playback_ids: asset.playback_ids } });
        } else if (asset.status === 'errored') {
          await applyMuxEvent({ type: 'video.asset.errored', data: { id: assetId, upload_id: uploadId, errors: asset.errors } });
        } else {
          await applyMuxEvent({ type: 'video.upload.asset_created', data: { id: uploadId, asset_id: assetId } });
        }
        rec = await MediaAsset.findOne({ uploadId }); // re-read after reconcile
      }
    } catch { /* Mux unreachable or asset not ready yet — return current status */ }
  }

  return {
    status: rec!.status,
    playbackId: rec!.playbackId,
    duration: rec!.duration,
    aspectRatio: rec!.aspectRatio,
    error: rec!.error,
  };
}

const STATUS_RANK = { waiting: 0, asset_created: 1, ready: 2, errored: 2 } as const;

// Idempotent + forward-only. Mux may deliver duplicates or out of order.
export async function applyMuxEvent(event: { type: string; data: any }): Promise<void> {
  const { type, data } = event;

  if (type === 'video.upload.asset_created') {
    const rec = await MediaAsset.findOne({ uploadId: data.id });
    if (!rec) return;
    if (STATUS_RANK[rec.status as MediaAssetStatus] < STATUS_RANK.asset_created) {
      rec.assetId = data.asset_id;
      rec.status = 'asset_created';
      await rec.save();
    } else if (!rec.assetId) {
      rec.assetId = data.asset_id;
      await rec.save();
    }
    return;
  }

  if (type === 'video.asset.ready') {
    const rec = await MediaAsset.findOne(data.upload_id ? { uploadId: data.upload_id } : { assetId: data.id });
    if (!rec || rec.status === 'ready' || rec.status === 'errored') return;

    const duration = typeof data.duration === 'number' ? data.duration : undefined;
    const playbackId = data.playback_ids?.[0]?.id;

    if (duration !== undefined && duration > MAX_VIDEO_DURATION_SECONDS) {
      rec.status = 'errored';
      rec.error = `Video too long (${Math.round(duration)}s > ${MAX_VIDEO_DURATION_SECONDS}s)`;
      await rec.save();
      if (rec.entityType === 'event') await attachToEvent({ eventId: rec.entityId, uploadId: rec.uploadId, status: 'errored' });
      return;
    }

    rec.assetId = data.id;
    rec.playbackId = playbackId;
    rec.duration = duration;
    rec.aspectRatio = data.aspect_ratio;
    rec.status = 'ready';
    await rec.save();
    if (rec.entityType === 'event') await attachToEvent({ eventId: rec.entityId, uploadId: rec.uploadId, playbackId, duration, aspectRatio: data.aspect_ratio, status: 'ready' });
    return;
  }

  if (type === 'video.asset.errored') {
    const rec = await MediaAsset.findOne(data.upload_id ? { uploadId: data.upload_id } : { assetId: data.id });
    if (!rec || rec.status === 'ready' || rec.status === 'errored') return;
    rec.status = 'errored';
    rec.error = data.errors?.messages?.join('; ') || 'Mux asset errored';
    await rec.save();
    if (rec.entityType === 'event') await attachToEvent({ eventId: rec.entityId, uploadId: rec.uploadId, status: 'errored' });
  }
}
