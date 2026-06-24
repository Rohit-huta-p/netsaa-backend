import mongoose, { Schema, Document, Model } from 'mongoose';

/**
 * A directory viewer's personal bookmark of a talent profile.
 * Mirrors the savedgigs / savedevents pattern. Collection: `savedtalents`.
 */
export interface ISavedTalent extends Document {
    user: mongoose.Types.ObjectId;   // the viewer who saved (ref User)
    talent: mongoose.Types.ObjectId; // the saved directory profile (ref User)
    createdAt: Date;
    updatedAt: Date;
}

const SavedTalentSchema = new Schema<ISavedTalent>(
    {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        talent: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    },
    { timestamps: true }
);

// One row per (viewer, talent) — makes save idempotent at the DB level.
SavedTalentSchema.index({ user: 1, talent: 1 }, { unique: true });

const SavedTalent: Model<ISavedTalent> = mongoose.model<ISavedTalent>('SavedTalent', SavedTalentSchema);
export default SavedTalent;
