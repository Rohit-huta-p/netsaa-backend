import mongoose, { Schema, Document } from 'mongoose';

export type MediaAssetStatus = 'waiting' | 'asset_created' | 'ready' | 'errored';

export interface IMediaAsset extends Document {
  uploadId: string;
  assetId?: string;
  playbackId?: string;
  playbackPolicy: 'public' | 'signed';
  entityType: 'event';
  entityId: string;
  purpose: string;
  ownerId: string;
  status: MediaAssetStatus;
  duration?: number;
  aspectRatio?: string;
  error?: string;
}

const MediaAssetSchema = new Schema<IMediaAsset>(
  {
    uploadId: { type: String, required: true, unique: true, index: true },
    assetId: { type: String, index: true, sparse: true },
    playbackId: { type: String },
    playbackPolicy: { type: String, enum: ['public', 'signed'], default: 'public' },
    entityType: { type: String, enum: ['event'], required: true },
    entityId: { type: String, required: true },
    purpose: { type: String, required: true },
    ownerId: { type: String, required: true },
    status: { type: String, enum: ['waiting', 'asset_created', 'ready', 'errored'], default: 'waiting' },
    duration: { type: Number },
    aspectRatio: { type: String },
    error: { type: String },
  },
  { timestamps: true },
);

export const MediaAsset = mongoose.models.MediaAsset || mongoose.model<IMediaAsset>('MediaAsset', MediaAssetSchema);
