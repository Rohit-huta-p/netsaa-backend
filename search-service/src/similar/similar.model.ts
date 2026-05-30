import { Schema, model, Document, Types } from 'mongoose';

export interface SimilarListItem {
  peerId: Types.ObjectId;
  score: number;
  reasons: string[];
  craftOverlap: number;
  skillOverlap: number;
  cityMatch: boolean;
}

export interface SimilarArtistsDoc extends Document {
  artistId: Types.ObjectId;
  list: SimilarListItem[];
  computedAt: Date;
}

const schema = new Schema<SimilarArtistsDoc>({
  artistId: { type: Schema.Types.ObjectId, required: true, unique: true, index: true },
  list: [{
    peerId: { type: Schema.Types.ObjectId, required: true },
    score: { type: Number, required: true },
    reasons: { type: [String], default: [] },
    craftOverlap: { type: Number, default: 0 },
    skillOverlap: { type: Number, default: 0 },
    cityMatch:    { type: Boolean, default: false },
  }],
  computedAt: { type: Date, required: true },
}, { collection: 'similar_artists' });

export const SimilarArtists = model<SimilarArtistsDoc>('SimilarArtists', schema);
