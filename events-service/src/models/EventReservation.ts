import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IEventReservation extends Document {
    eventId: mongoose.Types.ObjectId;
    ticketTypeId?: mongoose.Types.ObjectId;
    userId: mongoose.Types.ObjectId;
    quantity: number;
    totalAmount: number;
    status: 'reserved' | 'paid' | 'expired' | 'released';
    expiresAt: Date;
    createdAt: Date;
    updatedAt: Date;
}

const eventReservationSchema = new Schema<IEventReservation>(
    {
        eventId: { type: Schema.Types.ObjectId, ref: 'Event', required: true },
        ticketTypeId: { type: Schema.Types.ObjectId, ref: 'EventTicketType' },
        userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        quantity: { type: Number, required: true },
        totalAmount: { type: Number, required: true },
        status: {
            type: String,
            enum: ['reserved', 'paid', 'expired', 'released'],
            default: 'reserved',
        },
        expiresAt: { type: Date, required: true },
    },
    { timestamps: true }
);

// Indexes
eventReservationSchema.index({ eventId: 1, ticketTypeId: 1 });
eventReservationSchema.index({ userId: 1 });
eventReservationSchema.index({ status: 1, expiresAt: 1 }); // For finding expired reservations

const EventReservation: Model<IEventReservation> = mongoose.model<IEventReservation>(
    'EventReservation',
    eventReservationSchema
);

export default EventReservation;
