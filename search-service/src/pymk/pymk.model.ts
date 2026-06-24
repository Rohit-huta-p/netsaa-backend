import { Schema, model, Document, Types } from 'mongoose';

export interface PymkListItem {
  artistId: Types.ObjectId;
  score: number;
  reasons: string[];
  mutualCount: number;
  craftOverlap: number;
}

export interface PymkRecommendationDoc extends Document {
  userId: Types.ObjectId;
  strategy: 'graph' | 'contacts' | 'craft-city';
  list: PymkListItem[];
  computedAt: Date;
  version: number;
}

const schema = new Schema<PymkRecommendationDoc>({
  userId: { type: Schema.Types.ObjectId, required: true, unique: true, index: true },
  strategy: { type: String, enum: ['graph', 'contacts', 'craft-city'], required: true },
  list: [{
    artistId: { type: Schema.Types.ObjectId, required: true },
    score: { type: Number, required: true },
    reasons: { type: [String], default: [] },
    mutualCount: { type: Number, default: 0 },
    craftOverlap: { type: Number, default: 0 },
  }],
  computedAt: { type: Date, required: true },
  version: { type: Number, default: 1 },
}, { collection: 'pymk_recommendations' });

export const PymkRecommendation = model<PymkRecommendationDoc>('PymkRecommendation', schema);
