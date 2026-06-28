import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IEventCancellation extends Document {
    eventId: mongoose.Types.ObjectId;
    cancelledBy: mongoose.Types.ObjectId;          // organizer userId (or admin)
    reason: string;                                // shown verbatim to attendees

    affectedRegistrationsCount: number;
    affectedAttendeeCount: number;                 // sum of quantities
    totalRefundAmountPaise: number;                // ticketPrice * qty sum
    netsaAbsorbedTotalPaise: number;               // Q2 · sum of service fees NETSA covered

    refundsInitiatedAt?: Date;
    refundsCompletedAt?: Date;
    refundsFailedCount: number;                    // for admin escalation

    attendeesNotifiedAt?: Date;

    createdAt: Date;
    updatedAt: Date;
}

const eventCancellationSchema = new Schema<IEventCancellation>(
    {
        eventId: { type: Schema.Types.ObjectId, ref: 'Event', required: true, unique: true },
        cancelledBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        reason: { type: String, required: true, maxlength: 500 },

        affectedRegistrationsCount: { type: Number, required: true, min: 0 },
        affectedAttendeeCount: { type: Number, required: true, min: 0 },
        totalRefundAmountPaise: { type: Number, required: true, min: 0 },
        netsaAbsorbedTotalPaise: { type: Number, required: true, min: 0 },

        refundsInitiatedAt: { type: Date },
        refundsCompletedAt: { type: Date },
        refundsFailedCount: { type: Number, default: 0 },

        attendeesNotifiedAt: { type: Date },
    },
    { timestamps: true }
);

// Indexes
eventCancellationSchema.index({ eventId: 1 }, { unique: true });           // one cancellation per event
eventCancellationSchema.index({ cancelledBy: 1, createdAt: -1 });          // organizer cancellation history
eventCancellationSchema.index({ refundsFailedCount: 1 });                  // admin escalation queue

const EventCancellation: Model<IEventCancellation> = mongoose.model<IEventCancellation>(
    'EventCancellation',
    eventCancellationSchema
);

export default EventCancellation;
