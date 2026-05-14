import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IAttendeeInfo {
    fullName: string;
    email?: string;
    phone: string;
    notes?: string;
}

export interface IContactSnapshot {
    name: string;
    phone?: string;
    city?: string;
}

export interface IEventRegistration extends Document {
    eventId: mongoose.Types.ObjectId;
    userId: mongoose.Types.ObjectId;
    ticketTypeId?: mongoose.Types.ObjectId;
    status: 'confirmed' | 'cancelled' | 'attended' | 'no-show' | 'registered';
    registeredAt: Date;
    quantity: number;
    attendees?: IAttendeeInfo[];
    visibility: 'public' | 'private';
    source: 'rsvp' | 'paid';
    contactSnapshot?: IContactSnapshot;
    // T1 register-sheet fields (collected at register time, editable from profile)
    attendeeName: string;              // primary registrant name
    attendeeEmail?: string;            // optional, for ticket confirmation
    attendeePhone: string;             // REQUIRED for event ops (transactional consent)
    attendeeCount: number;             // 1-5 — counts seats reserved (used by capacity math)
    guestNames?: string[];             // length = attendeeCount - 1 if provided
    notes?: string;                    // max 300 chars
    linkAccessKey?: string;            // HKDF salt for online link decryption
    ticketCode?: string;               // T2 QR
    paidAmount?: number;               // T2
    paymentStatus?: 'pending' | 'completed' | 'refunded' | 'failed';
    razorpayOrderId?: string;
    razorpayPaymentId?: string;
    attendedMarkedAt?: Date;
    attendedMarkedBy?: 'hirer' | 'system';
    cancelledAt?: Date;
}

const attendeeInfoSchema = new Schema(
    {
        fullName: { type: String, required: true },
        email: { type: String },
        phone: { type: String, required: true },
        notes: { type: String },
    },
    { _id: false }
);

const eventRegistrationSchema = new Schema<IEventRegistration>({
    eventId: { type: Schema.Types.ObjectId, ref: 'Event', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    ticketTypeId: { type: Schema.Types.ObjectId, ref: 'EventTicketType' },
    quantity: { type: Number, default: 1 },
    status: {
        type: String,
        enum: ['confirmed', 'cancelled', 'attended', 'no-show', 'registered'],
        default: 'confirmed',
    },
    registeredAt: { type: Date, default: Date.now },
    attendees: [attendeeInfoSchema],
    visibility: { type: String, enum: ['public', 'private'], default: 'private', index: true },
    source: { type: String, enum: ['rsvp', 'paid'], required: true, default: 'rsvp' },
    contactSnapshot: {
        name: { type: String },
        phone: { type: String },
        city: { type: String },
    },
    // T1 register-sheet fields
    attendeeName: { type: String, required: true },
    attendeeEmail: { type: String },
    attendeePhone: { type: String, required: true },
    attendeeCount: { type: Number, default: 1, min: 1, max: 5 },
    guestNames: { type: [String], default: [] },
    notes: { type: String, maxlength: 300 },
    linkAccessKey: { type: String },
    ticketCode: { type: String },
    paidAmount: { type: Number },
    paymentStatus: { type: String, enum: ['pending', 'completed', 'refunded', 'failed'] },
    razorpayOrderId: { type: String },
    razorpayPaymentId: { type: String },
    attendedMarkedAt: { type: Date },
    attendedMarkedBy: { type: String, enum: ['hirer', 'system'] },
    cancelledAt: { type: Date },
});

// Indexes
eventRegistrationSchema.index({ eventId: 1 });
eventRegistrationSchema.index({ userId: 1 });
eventRegistrationSchema.index({ eventId: 1, userId: 1 }, { unique: true });

const EventRegistration: Model<IEventRegistration> = mongoose.model<IEventRegistration>(
    'EventRegistration',
    eventRegistrationSchema
);

export default EventRegistration;
