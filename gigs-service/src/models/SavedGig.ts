import mongoose, { Schema, Document } from 'mongoose';

export interface ISavedGig extends Document {
    userId: mongoose.Types.ObjectId;
    gigId: mongoose.Types.ObjectId;
    savedAt: Date;
}

const SavedGigSchema = new Schema<ISavedGig>({
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    gigId: { type: Schema.Types.ObjectId, ref: 'Gig', required: true },
    savedAt: { type: Date, default: Date.now }
});

// Ensure a user can only save a gig once
SavedGigSchema.index({ userId: 1, gigId: 1 }, { unique: true });

export const SavedGig = mongoose.model<ISavedGig>('SavedGig', SavedGigSchema);
export default SavedGig;
