import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IAttendeeInfo {
    fullName: string;
    email?: string;
    phone: string;
    notes?: string;
}

// Custom registration question answer (gap §6a-a). label+type are snapshotted from
// the event's question at register time so host display survives question edits;
// questionId is a best-effort link (event question ids churn on edit — see
// utils/registrationAnswers.ts).
export interface IRegistrationAnswer {
    questionId?: mongoose.Types.ObjectId;
    label: string;
    type: string;
    value: string;
}

// Apply-with-work submission (apply-door events, §6a-d): a short pitch plus portfolio
// links and/or media-service upload ids, shown to the host when they select applicants.
export interface IRegistrationApplication {
    pitch?: string;
    links?: string[];
    mediaIds?: string[];
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
    spotId?: mongoose.Types.ObjectId;        // which embedded event spot/tier was chosen (§6a-b)
    // 'pending' = approval-gated request (guest_list / apply door) awaiting host decision;
    // 'declined' = host rejected the request. Both hold no ticket and consume no seat (§6a-c/d).
    status: 'registered' | 'cancelled' | 'attended' | 'no-show' | 'pending' | 'declined';

    // Group registration
    quantity: number;
    attendees?: IAttendeeInfo[];

    // Answers to the event's custom registration questions (host-configured)
    answers?: IRegistrationAnswer[];

    // Apply-with-work submission (apply-door events)
    application?: IRegistrationApplication;

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

const registrationAnswerSchema = new Schema(
    {
        questionId: { type: Schema.Types.ObjectId },
        label: { type: String, required: true },
        type: { type: String, required: true },
        value: { type: String, default: '' },
    },
    { _id: false }
);

const registrationApplicationSchema = new Schema(
    {
        pitch: { type: String },
        links: { type: [String], default: undefined },
        mediaIds: { type: [String], default: undefined },
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
        spotId: { type: Schema.Types.ObjectId },        // embedded event spot/tier (§6a-b)

        status: {
            type: String,
            enum: ['registered', 'cancelled', 'attended', 'no-show', 'pending', 'declined'],
            default: 'registered',
        },

        quantity: { type: Number, default: 1, min: 1, max: 10 },
        attendees: [attendeeInfoSchema],

        answers: { type: [registrationAnswerSchema], default: undefined },
        application: { type: registrationApplicationSchema, default: undefined },

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
eventRegistrationSchema.index({ eventId: 1, spotId: 1 }, { sparse: true }); // per-spot seat counts (§6a-b)
eventRegistrationSchema.index({ eventId: 1, source: 1 });          // walkup analytics
eventRegistrationSchema.index({ userId: 1, status: 1 });           // "my events"
eventRegistrationSchema.index({ reviewSubmittedAt: 1 }, { sparse: true }); // review window queries

const EventRegistration: Model<IEventRegistration> = mongoose.model<IEventRegistration>(
    'EventRegistration',
    eventRegistrationSchema
);

export default EventRegistration;
