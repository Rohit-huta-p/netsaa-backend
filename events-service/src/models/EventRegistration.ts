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
