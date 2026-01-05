import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IEventTicketType extends Document {
    eventId: mongoose.Types.ObjectId;
    name: string;
    price: number;
    currency: 'INR';
    capacity: number;
    salesStartAt: Date;
    salesEndAt: Date;
    isRefundable: boolean;
    refundPolicyNotes?: string;
    createdAt: Date;
    updatedAt: Date;
}

const eventTicketTypeSchema = new Schema<IEventTicketType>(
    {
        eventId: { type: Schema.Types.ObjectId, ref: 'Event', required: true },
        name: { type: String, required: true },
        price: { type: Number, required: true },
        currency: { type: String, default: 'INR' },
        capacity: { type: Number, required: true },
        salesStartAt: { type: Date, required: true },
        salesEndAt: { type: Date, required: true },
        isRefundable: { type: Boolean, default: false },
        refundPolicyNotes: String,
    },
    { timestamps: true }
);

// Indexes
eventTicketTypeSchema.index({ eventId: 1 });
eventTicketTypeSchema.index({ salesStartAt: 1, salesEndAt: 1 });

const EventTicketType: Model<IEventTicketType> = mongoose.model<IEventTicketType>(
    'EventTicketType',
    eventTicketTypeSchema
);

export default EventTicketType;
