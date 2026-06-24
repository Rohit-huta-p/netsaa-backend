import mongoose, { Schema, Document } from 'mongoose';

// ─── Interface ───
export interface ISupportEscalation extends Document {
    ticketId: mongoose.Types.ObjectId;
    escalatedTo: mongoose.Types.ObjectId;
    reason: string;
    createdAt: Date;
}

// ─── Schema ───
const SupportEscalationSchema = new Schema<ISupportEscalation>(
    {
        ticketId: {
            type: Schema.Types.ObjectId,
            ref: 'SupportTicket',
            required: true,
            index: true,
        },

        escalatedTo: {
            type: Schema.Types.ObjectId,
            required: true,
        },

        reason: { type: String, required: true },
    },
    {
        timestamps: { createdAt: true, updatedAt: false },
    }
);

// ─── Index: ticketId + createdAt for escalation history ───
SupportEscalationSchema.index({ ticketId: 1, createdAt: -1 });

export const SupportEscalation = mongoose.model<ISupportEscalation>(
    'SupportEscalation',
    SupportEscalationSchema
);
export default SupportEscalation;
