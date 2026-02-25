import mongoose, { Schema, Document, Model } from 'mongoose';

/* ---------- Type constants ---------- */

export const ORGANIZER_TYPE_CATEGORIES = [
    'individual',
    'academy',
    'registered_business',
    'agency',
    'venue',
    'brand',
    'corporate'
] as const;
export type OrganizerTypeCategory = (typeof ORGANIZER_TYPE_CATEGORIES)[number];

export const VERIFICATION_LEVELS = ['none', 'basic', 'business', 'trusted'] as const;
export type VerificationLevel = (typeof VERIFICATION_LEVELS)[number];

/* ---------- Sub-interfaces ---------- */

export interface IOrganizerStats {
    gigsPosted?: number;
    eventsCreated?: number;
    artistsHired?: number;
    averageRating?: number;
    totalReviews?: number;
    responseRate?: number; // percent
}

export interface IPrimaryContact {
    fullName: string;
    designation?: string;
    phone: string;
    email: string;
}

export interface IBillingDetails {
    legalBusinessName?: string;
    gstNumber?: string;
    billingAddress?: string;
    state?: string;
    pincode?: string;
    country?: string;
}

export interface IVerification {
    businessVerified: boolean;
    gstNumber?: string;
    documentsSubmitted?: boolean;
    verifiedAt?: Date;
    verificationLevel: VerificationLevel;
}

/* ---------- Organizer interface ---------- */

export interface IOrganizer extends Document {
    userId: mongoose.Types.ObjectId; // link to users._id
    organizationName?: string;
    organizationType?: string[]; // Multi-select
    organizationWebsite?: string;
    organizerTypeCategory: OrganizerTypeCategory;
    logoUrl?: string;
    primaryContact: IPrimaryContact;
    billingDetails?: IBillingDetails;
    organizerStats?: IOrganizerStats;
    verification: IVerification;
    createdAt: Date;
    updatedAt: Date;
}

/* ---------- Sub-schemas ---------- */

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

const PrimaryContactSchema = new Schema(
    {
        fullName: { type: String, required: true },
        designation: { type: String },
        phone: { type: String, required: true },
        email: { type: String, required: true }
    },
    { _id: false }
);

const BillingDetailsSchema = new Schema(
    {
        legalBusinessName: { type: String },
        gstNumber: { type: String },
        billingAddress: { type: String },
        state: { type: String },
        pincode: { type: String },
        country: { type: String }
    },
    { _id: false }
);

const VerificationSchema = new Schema(
    {
        businessVerified: { type: Boolean, default: false },
        gstNumber: { type: String },
        documentsSubmitted: { type: Boolean, default: false },
        verifiedAt: { type: Date },
        verificationLevel: {
            type: String,
            enum: VERIFICATION_LEVELS,
            default: 'none'
        }
    },
    { _id: false }
);

/* ---------- Main schema ---------- */

const OrganizerSchema = new Schema<IOrganizer>(
    {
        userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
        organizationName: { type: String, index: true },
        organizationType: { type: [String], default: [] }, // Multi-select
        organizationWebsite: { type: String },
        organizerTypeCategory: {
            type: String,
            enum: ORGANIZER_TYPE_CATEGORIES,
            required: true
        },
        logoUrl: { type: String },
        primaryContact: { type: PrimaryContactSchema, required: true },
        billingDetails: { type: BillingDetailsSchema, default: {} },
        organizerStats: { type: OrganizerStatsSchema, default: {} },
        verification: { type: VerificationSchema, default: () => ({}) }
    },
    { timestamps: true }
);

/* ---------- Indexes ---------- */

OrganizerSchema.index({ 'organizerStats.averageRating': -1 });
OrganizerSchema.index({ organizerTypeCategory: 1 });
OrganizerSchema.index({ 'verification.verificationLevel': 1 });

const Organizer: Model<IOrganizer> = mongoose.model<IOrganizer>('Organizer', OrganizerSchema);
export default Organizer;

