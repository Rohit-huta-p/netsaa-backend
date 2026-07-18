import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IProfileView extends Document {
  viewerId: mongoose.Types.ObjectId;
  viewedUserId: mongoose.Types.ObjectId;
  day: string; // 'YYYY-MM-DD' (UTC) — per-day dedup bucket
  at: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ProfileViewSchema = new Schema<IProfileView>(
  {
    viewerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    viewedUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    day: { type: String, required: true },
    at: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// One row per (viewer, viewed, day) — dedups repeat views within a day.
ProfileViewSchema.index({ viewerId: 1, viewedUserId: 1, day: 1 }, { unique: true });
// Weekly-delta lookups: "views of me in the last 7 days".
ProfileViewSchema.index({ viewedUserId: 1, at: -1 });
// TTL: auto-remove ~90 days after the view to bound growth.
ProfileViewSchema.index({ at: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });

const ProfileView: Model<IProfileView> = mongoose.model<IProfileView>('ProfileView', ProfileViewSchema);
export default ProfileView;
