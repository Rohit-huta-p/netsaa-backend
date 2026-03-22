import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IOtpSession extends Document {
    phone: string;
    otpHash: string;
    expiresAt: Date;
    attempts: number;
    isUsed: boolean;
    createdAt: Date;
}

const OtpSessionSchema = new Schema<IOtpSession>(
    {
        phone: {
            type: String,
            required: true,
            index: true
        },
        otpHash: {
            type: String,
            required: true
        },
        expiresAt: {
            type: Date,
            required: true,
            index: { expires: 0 } // TTL index based on the explicit 'expiresAt' date
        },
        attempts: {
            type: Number,
            default: 0
        },
        isUsed: {
            type: Boolean,
            default: false
        },
        createdAt: {
            type: Date,
            default: Date.now
        }
    },
    { timestamps: false }
);

// Mongoose automatically builds an index on the fields requested in schema definition
const OtpSession: Model<IOtpSession> = mongoose.model<IOtpSession>('OtpSession', OtpSessionSchema);

export default OtpSession;
