import mongoose, { Schema, Document, Model } from 'mongoose';

export type ConsentScope =
    | 'event_registration'      // sharing name/phone with hosts
    | 'marketing_emails'        // promo emails from NETSA
    | 'analytics_tracking'      // usage analytics
    | 'data_retention_extended'; // opt-in to longer than 12 months

export interface IUserConsent extends Document {
    userId: mongoose.Types.ObjectId;
    scope: ConsentScope;
    version: string;                 // policy version at time of accept (e.g. '2026.1')
    acceptedAt: Date;
    revokedAt?: Date;
    ipAddress?: string;              // audit trail
    userAgent?: string;
    createdAt: Date;
    updatedAt: Date;
}

const userConsentSchema = new Schema<IUserConsent>(
    {
        userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        scope: {
            type: String,
            enum: ['event_registration', 'marketing_emails', 'analytics_tracking', 'data_retention_extended'],
            required: true,
        },
        version: { type: String, required: true },
        acceptedAt: { type: Date, required: true },
        revokedAt: { type: Date },
        ipAddress: { type: String },
        userAgent: { type: String },
    },
    { timestamps: true }
);

// Indexes
userConsentSchema.index({ userId: 1, scope: 1 });                            // user's consent state per scope
userConsentSchema.index({ userId: 1, scope: 1, acceptedAt: -1 });             // latest consent (history retained)

const UserConsent: Model<IUserConsent> = mongoose.model<IUserConsent>(
    'UserConsent',
    userConsentSchema
);

export default UserConsent;
