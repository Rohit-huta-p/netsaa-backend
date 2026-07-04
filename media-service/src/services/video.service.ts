import { AuthUser } from '../middleware/auth';
import { mux, MUX_ASSET_SETTINGS } from '../config/mux';
import { MediaAsset } from '../models/MediaAsset';
import { checkUploadPermission } from './permission.service';
import { Purpose } from '../utils/mime';
import { EntityType } from '../utils/fileKey';

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
  const rec = await MediaAsset.findOne({ uploadId });
  if (!rec) return null;
  if (rec.ownerId !== user.id && user.role !== 'admin') return null; // owner-scoped
  return {
    status: rec.status,
    playbackId: rec.playbackId,
    duration: rec.duration,
    aspectRatio: rec.aspectRatio,
    error: rec.error,
  };
}
