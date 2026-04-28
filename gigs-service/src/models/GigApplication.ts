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
    status: 'applied' | 'shortlisted' | 'rejected' | 'hired' | 'withdrawn';

    /**
     * Hirer's chosen payment route at hire time. Recorded on the application
     * so the artist can see how the hirer plans to pay even before the
     * payment-service Razorpay flow is wired in. Optional because most
     * non-`hired` applications won't have it set.
     *   - `on_platform`  → hirer intends to route the payment through NETSA
     *                       (Razorpay Route once 3B ships).
     *   - `off_platform` → hirer pays the artist directly (UPI/cash/bank);
     *                       NETSA records the transaction post-fact.
     */
    paymentMethod?: 'on_platform' | 'off_platform';

    appliedAt: Date;
    updatedAt: Date;
    withdrawnAt?: Date;
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
        enum: ['applied', 'shortlisted', 'rejected', 'hired', 'withdrawn'],
        default: 'applied',
        index: true // Index for filtering by status
    },
    paymentMethod: {
        type: String,
        enum: ['on_platform', 'off_platform'],
        required: false
    },

    appliedAt: { type: Date, default: Date.now },
    withdrawnAt: { type: Date }
}, { timestamps: true });

// Ensure one application per artist per gig
GigApplicationSchema.index({ gigId: 1, artistId: 1 }, { unique: true });

export const GigApplication = mongoose.model<IGigApplication>('GigApplication', GigApplicationSchema);
export default GigApplication;
