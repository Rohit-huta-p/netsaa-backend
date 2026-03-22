import mongoose, { Schema, Document, Model } from 'mongoose';

/* ---------- TypeScript interface ---------- */

export interface IPasswordResetSession extends Document {
  email: string;
  codeHash: string;         // SHA-256 hash of the 6-digit code
  expiresAt: Date;           // 10-minute validity
  attempts: number;          // max 5 verification attempts
  isUsed: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/* ---------- Mongoose Schema ---------- */

const PasswordResetSessionSchema = new Schema<IPasswordResetSession>(
  {
    email: { type: String, required: true, index: true },
    codeHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    attempts: { type: Number, default: 0 },
    isUsed: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// TTL index: automatically remove documents 1 hour after creation
PasswordResetSessionSchema.index({ createdAt: 1 }, { expireAfterSeconds: 3600 });

const PasswordResetSession: Model<IPasswordResetSession> = mongoose.model<IPasswordResetSession>(
  'PasswordResetSession',
  PasswordResetSessionSchema
);

export default PasswordResetSession;
