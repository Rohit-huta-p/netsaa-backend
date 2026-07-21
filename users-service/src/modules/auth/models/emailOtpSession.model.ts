import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IEmailOtpSession extends Document {
    userId: mongoose.Types.ObjectId;
    email: string;
    codeHash: string;
    expiresAt: Date;
    attempts: number;
    isUsed: boolean;
    createdAt: Date;
}

const EmailOtpSessionSchema = new Schema<IEmailOtpSession>({
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    email: { type: String, required: true, index: true },
    codeHash: { type: String, required: true },
    expiresAt: { type: Date, required: true, index: { expires: 0 } }, // TTL
    attempts: { type: Number, default: 0 },
    isUsed: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
}, { timestamps: false });

const EmailOtpSession: Model<IEmailOtpSession> =
    mongoose.model<IEmailOtpSession>('EmailOtpSession', EmailOtpSessionSchema);

export default EmailOtpSession;
