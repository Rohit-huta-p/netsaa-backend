import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IAttendeeInfo {
    fullName: string;
    email?: string;
    phone: string;
    notes?: string;
}

export interface IPaymentRecord {
    razorpayPaymentId: string;
    razorpayOrderId?: string;
    capturedAt: Date;
    amountPaise: number;          // total customer paid (ticketPrice * qty + serviceFee), in paise
    serviceFeePaise: number;      // 2.36% Razorpay fee
    netsaFeePaise: number;        // 0.5% NETSA fee
    organizerNetPaise: number;    // landed in organizer's linked account
    refundId?: string;            // populated if refunded; Refund collection holds the full record
}

export interface IEventRegistration extends Document {
    eventId: mongoose.Types.ObjectId;
    userId?: mongoose.Types.ObjectId;
    ticketTypeId?: mongoose.Types.ObjectId;
    status: 'registered' | 'cancelled' | 'attended' | 'no-show';

    // Group registration
    quantity: number;
    attendees?: IAttendeeInfo[];

    // Idempotency · prevents double-tap from creating two registrations
    idempotencyKey: string;

    // Payment audit (paid events only)
    paymentRecord?: IPaymentRecord;

    // Offline payment (walk-up cash) — no Razorpay; NETSA takes no fee (money never touches platform)
    offlinePayment?: {
        method: 'cash';
        amountPaise: number;
        recordedByUserId: mongoose.Types.ObjectId;
        recordedAt: Date;
    };

    // Cancellation audit
    cancelledAt?: Date;
    cancelledBy?: 'attendee' | 'organizer' | 'admin' | 'system';
    cancellationReason?: string;

    // Trust signals
    noShowMarkedAt?: Date;
    reviewSubmittedAt?: Date;
    reviewId?: mongoose.Types.ObjectId;

    // Roster visibility (Q4 · DPDP) — attendee chooses to be listed on public roster
    visibility: 'public' | 'private';

    // Provenance · standard = normal flow, walkup = added at the door, admin_added = manual
    source: 'standard' | 'walkup' | 'admin_added';

    // Organizer-applied labels (e.g. 'vip', 'media')
    tags: string[];

    registeredAt: Date;
    createdAt: Date;
    updatedAt: Date;
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

const paymentRecordSchema = new Schema(
    {
        razorpayPaymentId: { type: String, required: true },
        razorpayOrderId: { type: String },
        capturedAt: { type: Date, required: true },
        amountPaise: { type: Number, required: true },
        serviceFeePaise: { type: Number, required: true },
        netsaFeePaise: { type: Number, required: true },
        organizerNetPaise: { type: Number, required: true },
        refundId: { type: String },
    },
    { _id: false }
);

const offlinePaymentSchema = new Schema(
    {
        method: { type: String, enum: ['cash'], required: true },
        amountPaise: { type: Number, required: true },
        recordedByUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        recordedAt: { type: Date, required: true },
    },
    { _id: false }
);

const eventRegistrationSchema = new Schema<IEventRegistration>(
    {
        eventId: { type: Schema.Types.ObjectId, ref: 'Event', required: true },
        userId: { type: Schema.Types.ObjectId, ref: 'User', required: false },
        ticketTypeId: { type: Schema.Types.ObjectId, ref: 'EventTicketType' },

        status: {
            type: String,
            enum: ['registered', 'cancelled', 'attended', 'no-show'],
            default: 'registered',
        },

        quantity: { type: Number, default: 1, min: 1, max: 10 },
        attendees: [attendeeInfoSchema],

        idempotencyKey: { type: String, required: true },

        paymentRecord: paymentRecordSchema,
        offlinePayment: offlinePaymentSchema,

        cancelledAt: { type: Date },
        cancelledBy: {
            type: String,
            enum: ['attendee', 'organizer', 'admin', 'system'],
        },
        cancellationReason: { type: String },

        noShowMarkedAt: { type: Date },
        reviewSubmittedAt: { type: Date },
        reviewId: { type: Schema.Types.ObjectId, ref: 'EventReview' },

        visibility: {
            type: String,
            enum: ['public', 'private'],
            default: 'public',
        },

        source: {
            type: String,
            enum: ['standard', 'walkup', 'admin_added'],
            default: 'standard',
        },

        tags: { type: [String], default: [] },

        registeredAt: { type: Date, default: Date.now },
    },
    { timestamps: true }
);

// Indexes
eventRegistrationSchema.index({ eventId: 1 });
eventRegistrationSchema.index({ userId: 1 });
eventRegistrationSchema.index({ eventId: 1, userId: 1 }, { unique: true, partialFilterExpression: { userId: { $exists: true } } });
eventRegistrationSchema.index({ idempotencyKey: 1 }, { unique: true });
eventRegistrationSchema.index({ eventId: 1, status: 1 });          // roster filters
eventRegistrationSchema.index({ eventId: 1, source: 1 });          // walkup analytics
eventRegistrationSchema.index({ userId: 1, status: 1 });           // "my events"
eventRegistrationSchema.index({ reviewSubmittedAt: 1 }, { sparse: true }); // review window queries

const EventRegistration: Model<IEventRegistration> = mongoose.model<IEventRegistration>(
    'EventRegistration',
    eventRegistrationSchema
);

export default EventRegistration;
