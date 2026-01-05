import mongoose, { Schema, Document } from 'mongoose';

export interface ISavedEvent extends Document {
    userId: string; // or mongoose.Types.ObjectId
    eventId: mongoose.Types.ObjectId;
    createdAt: Date;
}

const SavedEventSchema: Schema = new Schema({
    userId: {
        type: String, // String ID from auth service
        required: true,
        index: true
    },
    eventId: {
        type: Schema.Types.ObjectId,
        ref: 'Event',
        required: true,
        index: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Compound index to prevent duplicates
SavedEventSchema.index({ userId: 1, eventId: 1 }, { unique: true });

export default mongoose.model<ISavedEvent>('SavedEvent', SavedEventSchema);
