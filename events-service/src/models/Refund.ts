import mongoose, { Schema, Document, Model } from 'mongoose';

export type RefundStatus =
    | 'pending'           // initiated, waiting for Razorpay
    | 'processed'         // Razorpay confirmed via webhook
    | 'failed'            // Razorpay returned failure
    | 'manual_required';  // multiple retries failed; admin must intervene

export type RefundTrigger =
    | 'attendee_cancel'
    | 'organizer_cancel'
    | 'reschedule_opt_out'
    | 'admin_force';

export interface IRefund extends Document {
    registrationId: mongoose.Types.ObjectId;
    eventId: mongoose.Types.ObjectId;
    userId: mongoose.Types.ObjectId;

    razorpayRefundId?: string;        // 'rfnd_xxx' from Razorpay
    razorpayPaymentId: string;        // the original payment being refunded

    trigger: RefundTrigger;
    triggeredBy: mongoose.Types.ObjectId; // userId of who initiated

    // Amounts in paise
    refundAmountPaise: number;        // refunded to customer's instrument
    netsaAbsorbedPaise: number;       // Q2 · NETSA-eats-fee on organizer cancel (otherwise 0)

    status: RefundStatus;
    retryCount: number;
    lastErrorMessage?: string;
    initiatedAt: Date;
    processedAt?: Date;
    failedAt?: Date;

    createdAt: Date;
    updatedAt: Date;
}

const refundSchema = new Schema<IRefund>(
    {
        registrationId: { type: Schema.Types.ObjectId, ref: 'EventRegistration', required: true },
        eventId: { type: Schema.Types.ObjectId, ref: 'Event', required: true },
        userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },

        razorpayRefundId: { type: String },
        razorpayPaymentId: { type: String, required: true },

        trigger: {
            type: String,
            enum: ['attendee_cancel', 'organizer_cancel', 'reschedule_opt_out', 'admin_force'],
            required: true,
        },
        triggeredBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },

        refundAmountPaise: { type: Number, required: true, min: 0 },
        netsaAbsorbedPaise: { type: Number, default: 0, min: 0 },

        status: {
            type: String,
            enum: ['pending', 'processed', 'failed', 'manual_required'],
            default: 'pending',
        },
        retryCount: { type: Number, default: 0, min: 0 },
        lastErrorMessage: { type: String },
        initiatedAt: { type: Date, default: Date.now },
        processedAt: { type: Date },
        failedAt: { type: Date },
    },
    { timestamps: true }
);

// Indexes
refundSchema.index({ registrationId: 1 });
refundSchema.index({ razorpayRefundId: 1 }, { sparse: true, unique: true });    // webhook lookup
refundSchema.index({ razorpayPaymentId: 1 });                                    // original payment trace
refundSchema.index({ status: 1, initiatedAt: 1 });                               // retry sweeper
refundSchema.index({ eventId: 1, trigger: 1 });                                  // organizer-cancel batch reporting

const Refund: Model<IRefund> = mongoose.model<IRefund>('Refund', refundSchema);

export default Refund;
