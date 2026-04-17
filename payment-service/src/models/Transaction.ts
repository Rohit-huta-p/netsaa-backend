import mongoose, { Schema, Document } from 'mongoose';

/**
 * Transaction Model — NETSA Payment System
 *
 * Tracks all monetary transactions: on-platform Razorpay payments,
 * offline recordings (UPI/cash/bank), event tickets, and sub-artist payments.
 *
 * NO ESCROW. Every on-platform payment is an instant split via Razorpay Route.
 * 88% to artist, 12% to NETSA at transaction time.
 *
 * Schema from System Design v2 (lines 321-347, 559-567)
 */

export interface ITimelineEntry {
    event: string;
    at: Date;
    metadata?: any;
}

export interface IOfflineDetails {
    method: 'upi' | 'bank_transfer' | 'cash' | 'google_pay' | 'credit_card' | 'debit_card' | 'other';
    referenceId?: string;
    note?: string;
    /** User-reported payment date (from the form). Authoritative for display. */
    userReportedPaidAt?: Date;
    /** Alias for userReportedPaidAt — back-compat with the controller. */
    paidAt?: Date;
    /** S3 URL of optional payment screenshot. Marked 'unverified' — not proof. */
    screenshotUrl?: string;
}

export interface IDisputeDetails {
    openedBy?: mongoose.Types.ObjectId;
    openedAt?: Date;
    reason?: string;
    evidenceUrls?: string[];
    resolvedBy?: mongoose.Types.ObjectId;
    resolvedAt?: Date;
    resolution?: 'confirmed' | 'partial_confirmed' | 'fraudulent_record';
    disputedAmount?: number;
    claimedAmount?: number;
}

export interface IPlatformFee {
    rate: number;
    amount: number;
}

export interface ITransaction extends Document {
    schemaVersion: number;
    gigId?: mongoose.Types.ObjectId;
    eventId?: mongoose.Types.ObjectId;
    contractId?: mongoose.Types.ObjectId;
    parentTransactionId?: mongoose.Types.ObjectId;
    type: 'gig_payment' | 'event_ticket' | 'sub_artist' | 'offline_record';
    paymentStructure: 'full' | 'advance_30' | 'balance_70';
    layer: 'primary' | 'secondary';
    fromUserId: mongoose.Types.ObjectId;
    toUserId: mongoose.Types.ObjectId;
    amount: number;
    currency: string;
    platformFee: IPlatformFee;
    artistReceived: number;
    razorpayOrderId?: string;
    razorpayPaymentId?: string;
    razorpayTransferId?: string;
    idempotencyKey: string;
    /**
     * Status set. 'recorded' + 'reopened' are offline-specific states. Full state
     * machine in utils/stateMachine.ts.
     */
    status:
        | 'created'
        | 'recorded'       // offline_record initial state (matches OFFLINE_TRANSITIONS)
        | 'paid'
        | 'confirmed'
        | 'completed'
        | 'disputed'
        | 'reopened'       // dispute reopened within 30-day chargeback window
        | 'refunded'
        | 'failed'
        | 'expired';
    offlineDetails?: IOfflineDetails;
    dispute?: IDisputeDetails;
    recordedBy?: mongoose.Types.ObjectId;
    confirmedByPayee: boolean;
    confirmedAt?: Date;
    /**
     * Confirmed payments are NOT immediately counted by Trust Engine — held until
     * this date to allow for bank-level reversal (chargeback window). Default 30d
     * after confirmedAt. Trust Engine only counts `completed` (post-lockup), not
     * `confirmed`.
     */
    chargebackLockUntil?: Date;
    /**
     * Trust Engine signal multiplier. 1.0 for on-platform, 0.7 for confirmed
     * offline, -1.0 for disputed. Computed at write time so Trust Engine reads
     * without recomputing.
     */
    trustWeight: number;
    timeline: ITimelineEntry[];
    completedAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}

const TimelineSchema = new Schema<ITimelineEntry>({
    event: { type: String, required: true },
    at: { type: Date, default: Date.now },
    metadata: { type: Schema.Types.Mixed },
}, { _id: false });

const OfflineDetailsSchema = new Schema<IOfflineDetails>({
    method: {
        type: String,
        enum: ['upi', 'bank_transfer', 'cash', 'google_pay', 'credit_card', 'debit_card', 'other'],
        required: true,
    },
    referenceId: { type: String, maxlength: 128 },
    note: { type: String, maxlength: 500 },
    userReportedPaidAt: { type: Date },
    paidAt: { type: Date },
    screenshotUrl: { type: String, maxlength: 2048 },
}, { _id: false });

const DisputeDetailsSchema = new Schema<IDisputeDetails>({
    openedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    openedAt: { type: Date },
    reason: { type: String, maxlength: 500 },
    evidenceUrls: [{ type: String, maxlength: 2048 }],
    resolvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    resolvedAt: { type: Date },
    resolution: {
        type: String,
        enum: ['confirmed', 'partial_confirmed', 'fraudulent_record'],
    },
    disputedAmount: { type: Number, min: 0 },
    claimedAmount: { type: Number, min: 0 },
}, { _id: false });

const TransactionSchema = new Schema<ITransaction>({
    schemaVersion: { type: Number, default: 1 },

    gigId: { type: Schema.Types.ObjectId, ref: 'Gig' },
    eventId: { type: Schema.Types.ObjectId, ref: 'Event' },
    contractId: { type: Schema.Types.ObjectId, ref: 'Contract' },
    parentTransactionId: { type: Schema.Types.ObjectId, ref: 'Transaction' },

    type: {
        type: String,
        enum: ['gig_payment', 'event_ticket', 'sub_artist', 'offline_record'],
        required: true,
        index: true,
    },
    paymentStructure: {
        type: String,
        enum: ['full', 'advance_30', 'balance_70'],
        default: 'full',
    },
    layer: {
        type: String,
        enum: ['primary', 'secondary'],
        default: 'primary',
    },

    fromUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    toUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },

    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'INR' },

    platformFee: {
        rate: { type: Number, default: 0 },
        amount: { type: Number, default: 0 },
    },
    artistReceived: { type: Number, default: 0 },

    razorpayOrderId: { type: String },
    razorpayPaymentId: { type: String },
    razorpayTransferId: { type: String },

    idempotencyKey: { type: String, required: true },
    status: {
        type: String,
        enum: [
            'created',
            'recorded',    // offline_record initial state (matches OFFLINE_TRANSITIONS)
            'paid',
            'confirmed',
            'completed',
            'disputed',
            'reopened',    // dispute reopened within 30d chargeback window
            'refunded',
            'failed',
            'expired',
        ],
        default: 'created',
        index: true,
    },

    offlineDetails: OfflineDetailsSchema,
    dispute: DisputeDetailsSchema,
    recordedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    confirmedByPayee: { type: Boolean, default: false },
    confirmedAt: { type: Date },
    /**
     * Chargeback-lock expiry. Trust Engine excludes `confirmed` transactions whose
     * chargebackLockUntil is in the future — i.e. they might still be reversed by
     * bank dispute. Only `completed` (post-lockup) counts toward Trust signals.
     */
    chargebackLockUntil: { type: Date },
    /**
     * Trust weight multiplier. Computed at transaction finalization:
     *   1.0  on-platform confirmed payment
     *   0.7  off-platform confirmed payment
     *  -1.0  disputed (any path) — penalty
     *   0.0  pending / recorded / paid (not yet counted)
     */
    trustWeight: { type: Number, default: 0, min: -1, max: 1 },

    timeline: [TimelineSchema],
    completedAt: { type: Date },
}, { timestamps: true });

// Indexes from System Design v2 (lines 559-567)
TransactionSchema.index({ fromUserId: 1, status: 1 }); // Hirer payment history
TransactionSchema.index({ toUserId: 1, status: 1 }); // Artist earnings
TransactionSchema.index({ gigId: 1, type: 1 }); // Gig payment lookup
TransactionSchema.index({ contractId: 1 }); // Contract payment lookup
TransactionSchema.index({ status: 1, createdAt: 1 }); // Reconciliation
TransactionSchema.index({ idempotencyKey: 1 }, { unique: true }); // Idempotency
TransactionSchema.index({ razorpayOrderId: 1 }); // Webhook handler
// Chargeback-lock sweep: find 'confirmed' rows whose lockup has expired
// (BullMQ chargeback-lock worker reads this daily to flip them to 'completed').
TransactionSchema.index({ status: 1, chargebackLockUntil: 1 });
// Trust Engine consumer: fast "all user's scored transactions" lookup
TransactionSchema.index({ toUserId: 1, status: 1, trustWeight: 1 });

export default mongoose.model<ITransaction>('Transaction', TransactionSchema);
