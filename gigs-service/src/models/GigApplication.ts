import mongoose, { Schema, Document } from 'mongoose';

export interface IGigApplication extends Document {
    gigId: mongoose.Types.ObjectId;
    artistId: mongoose.Types.ObjectId;

    artistSnapshot: {
        displayName: string;
        artistType: string;
        profileImageUrl: string;
        rating: number;
    };

    coverNote?: string;
    portfolioLinks?: string[];
    status: 'applied' | 'shortlisted' | 'rejected' | 'hired';

    appliedAt: Date;
    updatedAt: Date;
}

const GigApplicationSchema = new Schema<IGigApplication>({
    gigId: { type: Schema.Types.ObjectId, ref: 'Gig', required: true, index: true },
    artistId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    artistSnapshot: {
        displayName: String,
        artistType: String,
        profileImageUrl: String,
        rating: Number
    },

    coverNote: String,
    portfolioLinks: [String],
    status: {
        type: String,
        enum: ['applied', 'shortlisted', 'rejected', 'hired'],
        default: 'applied',
        index: true // Index for filtering by status
    },

    appliedAt: { type: Date, default: Date.now }
}, { timestamps: true });

// Ensure one application per artist per gig
GigApplicationSchema.index({ gigId: 1, artistId: 1 }, { unique: true });

export const GigApplication = mongoose.model<IGigApplication>('GigApplication', GigApplicationSchema);
export default GigApplication;
