import mongoose, { Schema, Document, Model } from 'mongoose';

// Custom-question answers held with the reservation so they survive the paid
// flow (reserve → Razorpay → webhook creates the Registration). See
// utils/registrationAnswers.ts for why label+type are snapshotted.
export interface IReservationAnswer {
    questionId?: mongoose.Types.ObjectId;
    label: string;
    type: string;
    value: string;
}

export interface IEventReservation extends Document {
    eventId: mongoose.Types.ObjectId;
    ticketTypeId?: mongoose.Types.ObjectId;
    spotId?: mongoose.Types.ObjectId;        // embedded event spot/tier chosen (§6a-b)
    userId: mongoose.Types.ObjectId;
    quantity: number;
    answers?: IReservationAnswer[];
    totalAmount: number;             // in rupees (legacy)
    status: 'reserved' | 'paid' | 'expired' | 'released';
    expiresAt: Date;
    razorpayOrderId?: string;        // populated when the Razorpay order is created
    idempotencyKey: string;          // client-supplied · prevents double-tap reservations
    createdAt: Date;
    updatedAt: Date;
}

const reservationAnswerSchema = new Schema(
    {
        questionId: { type: Schema.Types.ObjectId },
        label: { type: String, required: true },
        type: { type: String, required: true },
        value: { type: String, default: '' },
    },
    { _id: false }
);

const eventReservationSchema = new Schema<IEventReservation>(
    {
        eventId: { type: Schema.Types.ObjectId, ref: 'Event', required: true },
        ticketTypeId: { type: Schema.Types.ObjectId, ref: 'EventTicketType' },
        spotId: { type: Schema.Types.ObjectId },        // embedded event spot/tier (§6a-b)
        userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        quantity: { type: Number, required: true },
        answers: { type: [reservationAnswerSchema], default: undefined },
        totalAmount: { type: Number, required: true },
        status: {
            type: String,
            enum: ['reserved', 'paid', 'expired', 'released'],
            default: 'reserved',
        },
        expiresAt: { type: Date, required: true },
        razorpayOrderId: { type: String },
        idempotencyKey: { type: String, required: true },
    },
    { timestamps: true }
);

// Indexes
eventReservationSchema.index({ eventId: 1, ticketTypeId: 1 });
eventReservationSchema.index({ userId: 1 });
eventReservationSchema.index({ status: 1, expiresAt: 1 });            // expiry sweeper
eventReservationSchema.index({ razorpayOrderId: 1 }, { sparse: true, unique: true }); // webhook lookup
eventReservationSchema.index({ idempotencyKey: 1 }, { unique: true }); // replay safety

const EventReservation: Model<IEventReservation> = mongoose.model<IEventReservation>(
    'EventReservation',
    eventReservationSchema
);

export default EventReservation;
