import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IEventTicket extends Document {
    ticketId: string;
    eventId: mongoose.Types.ObjectId;
    registrationId: mongoose.Types.ObjectId;
    userId: mongoose.Types.ObjectId;
    attendeeName: string;
    qrCode: string;
    status: 'issued' | 'checked_in' | 'cancelled';
    checkedInAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}

const eventTicketSchema = new Schema<IEventTicket>(
    {
        ticketId: { type: String, required: true, unique: true },
        eventId: { type: Schema.Types.ObjectId, ref: 'Event', required: true },
        registrationId: { type: Schema.Types.ObjectId, ref: 'EventRegistration', required: true },
        userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        attendeeName: { type: String, required: true, trim: true },
        qrCode: { type: String, required: true },
        status: {
            type: String,
            enum: ['issued', 'checked_in', 'cancelled'],
            default: 'issued',
        },
        checkedInAt: { type: Date },
    },
    { timestamps: true }
);

// Indexes
eventTicketSchema.index({ eventId: 1 });
eventTicketSchema.index({ registrationId: 1 });

const EventTicket: Model<IEventTicket> = mongoose.model<IEventTicket>(
    'EventTicket',
    eventTicketSchema
);

export default EventTicket;
