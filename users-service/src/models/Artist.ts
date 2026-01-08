import mongoose, { Schema, Document, Model } from 'mongoose';

/* ---------- Artist interface ---------- */

export interface IArtistStats {
    eventsAttended?: number;
    eventsHosted?: number;
    averageRating?: number;
    totalReviews?: number;
    profileViews?: number;
    lastGigAt?: Date;
    totalEarnings?: number;
}

export interface IArtist extends Document {
    userId: mongoose.Types.ObjectId; // reference to users._id
    userName?: string;
    languages?: string[];
    otherArtistType?: string;
    skills?: string[]; // mapped to specialities in schema? Schema says specialities. Interface says skills. Keeping schema consistent.
    specialities?: string[];
    genres?: string[];
    instruments?: string[];
    portfolioThumbs?: string[]; // small thumbs
    galleryCount?: number;
    availabilityId?: mongoose.Types.ObjectId; // ref to availability collection
    bookingPreferences?: Record<string, any>;
    paymentPreferences?: Record<string, any>;
    travelPreferences?: Record<string, any>;
    stats?: IArtistStats;
    featuredUntil?: Date;
    createdAt: Date;
    updatedAt: Date;
}

const ArtistStatsSchema = new Schema(
    {
        eventsAttended: { type: Number, default: 0 },
        eventsHosted: { type: Number, default: 0 },
        averageRating: { type: Number, default: 0 },
        totalReviews: { type: Number, default: 0 },
        profileViews: { type: Number, default: 0 },
        lastGigAt: { type: Date },
        totalEarnings: { type: Number, default: 0 }
    },
    { _id: false }
);

const ArtistSchema = new Schema<IArtist>(
    {
        userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
        userName: { type: String },
        languages: { type: [String], default: [] },
        specialities: { type: [String], default: [], index: true },
        portfolioThumbs: { type: [String], default: [] },
        galleryCount: { type: Number, default: 0 },
        availabilityId: { type: Schema.Types.ObjectId },
        stats: { type: ArtistStatsSchema, default: {} },
        featuredUntil: { type: Date }
    },
    { timestamps: true }
);

// Indexes
ArtistSchema.index({ specialities: 1 });
ArtistSchema.index({ 'stats.averageRating': -1, 'stats.profileViews': -1 });
ArtistSchema.index({ featuredUntil: 1 });

const Artist: Model<IArtist> = mongoose.model<IArtist>('Artist', ArtistSchema);
export default Artist;
