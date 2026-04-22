import mongoose, { Schema, Document, Model } from 'mongoose';

/* ---------- Type constants ---------- */

export const HIRER_TYPES = [
    'individual',
    'academy',
    'registered_business',
    'agency',
    'venue',
    'brand',
    'corporate',
] as const;
export type HirerType = (typeof HIRER_TYPES)[number];

/* ---------- Sub-interfaces ---------- */

export interface IHirerStats {
    gigsPosted?: number;
    artistsHired?: number;
    eventsCreated?: number;
    averageRating?: number;
    totalReviews?: number;
    responseRate?: number; // percent
}

/* ---------- HirerProfile interface ---------- */

export interface IHirerProfile extends Document {
    userId: mongoose.Types.ObjectId; // reference to users._id
    hirerType: HirerType;
    organizationName?: string;
    organizationWebsite?: string;
    logoUrl?: string;
    gstNumber?: string;
    profileComplete?: boolean;
    stats?: IHirerStats;
    createdAt: Date;
    updatedAt: Date;
}

/* ---------- Sub-schemas ---------- */

const HirerStatsSchema = new Schema<IHirerStats>(
    {
        gigsPosted:    { type: Number, default: 0 },
        artistsHired:  { type: Number, default: 0 },
        eventsCreated: { type: Number, default: 0 },
        averageRating: { type: Number, default: 0 },
        totalReviews:  { type: Number, default: 0 },
        responseRate:  { type: Number, default: 0 },
    },
    { _id: false }
);

/* ---------- Main schema ---------- */

const HirerProfileSchema = new Schema<IHirerProfile>(
    {
        userId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            unique: true,
            index: true,
        },
        hirerType: {
            type: String,
            enum: HIRER_TYPES,
            required: true,
            default: 'individual',
        },
        organizationName:    { type: String, index: true },
        organizationWebsite: { type: String },
        logoUrl:             { type: String },
        gstNumber:           { type: String },
        profileComplete:     { type: Boolean, default: false },
        stats:               { type: HirerStatsSchema, default: {} },
    },
    { timestamps: true }
);

/* ---------- Indexes ---------- */

HirerProfileSchema.index({ hirerType: 1 });
HirerProfileSchema.index({ 'stats.averageRating': -1 });

const HirerProfile: Model<IHirerProfile> = mongoose.model<IHirerProfile>(
    'HirerProfile',
    HirerProfileSchema
);
export default HirerProfile;
