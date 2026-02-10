import mongoose, { Schema, Document, Model } from 'mongoose';

/* ---------- Organizer interface ---------- */

export interface IOrganizerStats {
    gigsPosted?: number;
    eventsCreated?: number;
    artistsHired?: number;
    averageRating?: number;
    totalReviews?: number;
    responseRate?: number; // percent
}

export interface IOrganizer extends Document {
    userId: mongoose.Types.ObjectId; // link to users._id
    organizationName?: string;
    organizationType?: string[]; // Multi-select
    organizationWebsite?: string;
    billingDetails?: Record<string, any>;
    organizerStats?: IOrganizerStats;
    verification?: {
        businessVerified?: boolean;
        gstNumber?: string;
    };
    createdAt: Date;
    updatedAt: Date;
}

const OrganizerStatsSchema = new Schema(
    {
        gigsPosted: { type: Number, default: 0 },
        eventsCreated: { type: Number, default: 0 },
        artistsHired: { type: Number, default: 0 },
        averageRating: { type: Number, default: 0 },
        totalReviews: { type: Number, default: 0 },
        responseRate: { type: Number, default: 0 }
    },
    { _id: false }
);

const OrganizerSchema = new Schema<IOrganizer>(
    {
        userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
        organizationName: { type: String, index: true },
        organizationType: { type: [String], default: [] }, // Multi-select
        organizationWebsite: { type: String },
        billingDetails: { type: Schema.Types.Mixed, default: {} },
        organizerStats: { type: OrganizerStatsSchema, default: {} },
        verification: {
            businessVerified: { type: Boolean, default: false },
            gstNumber: { type: String }
        }
    },
    { timestamps: true }
);

// Indexes
OrganizerSchema.index({ 'organizerStats.averageRating': -1 });

const Organizer: Model<IOrganizer> = mongoose.model<IOrganizer>('Organizer', OrganizerSchema);
export default Organizer;
