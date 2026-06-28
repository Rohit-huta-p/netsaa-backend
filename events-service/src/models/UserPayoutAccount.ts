import mongoose, { Schema, Document, Model } from 'mongoose';

export type PayoutStatus =
    | 'not_started'
    | 'submitted'
    | 'pending_kyc'
    | 'verified'
    | 'rejected'
    | 'suspended';

export type BusinessType =
    | 'individual'
    | 'sole_prop'
    | 'partnership'
    | 'llp'
    | 'pvt_ltd';

export interface IUserPayoutAccount extends Document {
    userId: mongoose.Types.ObjectId;
    provider: 'razorpay';
    linkedAccountId?: string;          // Razorpay 'acc_xxx' — populated after submit
    status: PayoutStatus;
    businessType: BusinessType;

    // Masked at rest · raw values never persisted
    panMasked: string;                 // 'ABCDE****F'
    accountHolderName: string;
    bankLast4: string;                 // '****1234'
    bankName: string;                  // resolved from IFSC
    ifsc: string;
    gstin?: string;                    // optional

    rejectionReason?: string;
    submittedAt: Date;
    verifiedAt?: Date;
    suspendedAt?: Date;

    createdAt: Date;
    updatedAt: Date;
}

const userPayoutAccountSchema = new Schema<IUserPayoutAccount>(
    {
        userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
        provider: { type: String, default: 'razorpay', required: true },
        linkedAccountId: { type: String },

        status: {
            type: String,
            enum: ['not_started', 'submitted', 'pending_kyc', 'verified', 'rejected', 'suspended'],
            default: 'not_started',
        },

        businessType: {
            type: String,
            enum: ['individual', 'sole_prop', 'partnership', 'llp', 'pvt_ltd'],
            required: true,
        },

        panMasked: { type: String, required: true },
        accountHolderName: { type: String, required: true },
        bankLast4: { type: String, required: true },
        bankName: { type: String, required: true },
        ifsc: { type: String, required: true },
        gstin: { type: String },

        rejectionReason: { type: String },
        submittedAt: { type: Date, required: true, default: Date.now },
        verifiedAt: { type: Date },
        suspendedAt: { type: Date },
    },
    { timestamps: true }
);

// Indexes
userPayoutAccountSchema.index({ userId: 1 }, { unique: true });
userPayoutAccountSchema.index({ linkedAccountId: 1 }, { sparse: true, unique: true }); // Razorpay webhook lookup
userPayoutAccountSchema.index({ status: 1 });                                          // admin queue queries

const UserPayoutAccount: Model<IUserPayoutAccount> = mongoose.model<IUserPayoutAccount>(
    'UserPayoutAccount',
    userPayoutAccountSchema
);

export default UserPayoutAccount;
