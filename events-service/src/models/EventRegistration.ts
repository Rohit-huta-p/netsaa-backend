import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IEventRegistration extends Document {
    eventId: mongoose.Types.ObjectId;
    userId: mongoose.Types.ObjectId;
    ticketTypeId?: mongoose.Types.ObjectId;
    status: 'registered' | 'cancelled' | 'attended' | 'no-show';
    registeredAt: Date;
    quantity: number;
}

const eventRegistrationSchema = new Schema<IEventRegistration>({
    eventId: { type: Schema.Types.ObjectId, ref: 'Event', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    ticketTypeId: { type: Schema.Types.ObjectId, ref: 'EventTicketType' },
    quantity: { type: Number, default: 1 },
    status: {
        type: String,
        enum: ['registered', 'cancelled', 'attended', 'no-show'],
        default: 'registered',
    },
    registeredAt: { type: Date, default: Date.now },
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
