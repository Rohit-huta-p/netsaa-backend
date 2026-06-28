import mongoose, { Schema, Document, Model } from 'mongoose';

export type WaitlistStatus =
    | 'waiting'
    | 'promoted'        // organizer/auto promoted; user has confirmWindow to accept
    | 'confirmed'       // user accepted promotion (became a registration)
    | 'expired'         // promotion window passed without confirmation
    | 'declined'        // user left waitlist
    | 'cancelled';      // event cancelled

export interface IWaitlistEntry extends Document {
    eventId: mongoose.Types.ObjectId;
    userId: mongoose.Types.ObjectId;
    position: number;                  // 1-based · assigned by joinedAt order
    quantity: number;                  // how many seats they want
    attendeeSnapshot: {
        fullName: string;
        phone: string;
        email?: string;
    };
    status: WaitlistStatus;
    joinedAt: Date;
    promotedAt?: Date;
    promotionExpiresAt?: Date;         // 30 minutes after promotion
    confirmedAt?: Date;
    registrationId?: mongoose.Types.ObjectId; // populated when confirmed → registration
    createdAt: Date;
    updatedAt: Date;
}

const waitlistEntrySchema = new Schema<IWaitlistEntry>(
    {
        eventId: { type: Schema.Types.ObjectId, ref: 'Event', required: true },
        userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        position: { type: Number, required: true, min: 1 },
        quantity: { type: Number, default: 1, min: 1, max: 10 },
        attendeeSnapshot: {
            fullName: { type: String, required: true },
            phone: { type: String, required: true },
            email: String,
        },
        status: {
            type: String,
            enum: ['waiting', 'promoted', 'confirmed', 'expired', 'declined', 'cancelled'],
            default: 'waiting',
        },
        joinedAt: { type: Date, default: Date.now },
        promotedAt: { type: Date },
        promotionExpiresAt: { type: Date },
        confirmedAt: { type: Date },
        registrationId: { type: Schema.Types.ObjectId, ref: 'EventRegistration' },
    },
    { timestamps: true }
);

// Indexes
waitlistEntrySchema.index({ eventId: 1, userId: 1 }, { unique: true });          // one entry per user per event
waitlistEntrySchema.index({ eventId: 1, status: 1, position: 1 });               // top-of-queue lookup
waitlistEntrySchema.index({ status: 1, promotionExpiresAt: 1 });                 // promotion expiry sweeper
waitlistEntrySchema.index({ userId: 1, status: 1 });                             // user's waitlist view

const WaitlistEntry: Model<IWaitlistEntry> = mongoose.model<IWaitlistEntry>(
    'WaitlistEntry',
    waitlistEntrySchema
);

export default WaitlistEntry;
