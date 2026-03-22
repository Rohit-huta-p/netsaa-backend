import mongoose, { Schema, Document } from 'mongoose';

// ─── Interface ───
export interface ISupportTicket extends Document {
    userId: mongoose.Types.ObjectId;
    role: 'artist' | 'organizer';

    category: 'payment' | 'gig' | 'event' | 'account' | 'safety' | 'technical';
    subcategory?: string;

    relatedEntity?: {
        type: 'gig' | 'event' | 'conversation' | 'contract' | 'payment';
        entityId: mongoose.Types.ObjectId;
    };

    priority: 'low' | 'medium' | 'high' | 'critical';
    status: 'open' | 'in_review' | 'waiting_user' | 'resolved' | 'closed';

    slaDeadline: Date;

    createdAt: Date;
    updatedAt: Date;
}

// ─── Schema ───
const SupportTicketSchema = new Schema<ISupportTicket>(
    {
        userId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,                       // Index: userId
        },

        role: {
            type: String,
            enum: ['artist', 'organizer'],
            required: true,
        },

        category: {
            type: String,
            enum: ['payment', 'gig', 'event', 'account', 'safety', 'technical'],
            required: true,
            index: true,                       // Index: category
        },
        subcategory: { type: String },

        relatedEntity: {
            type: {
                type: String,
                enum: ['gig', 'event', 'conversation', 'contract', 'payment'],
            },
            entityId: { type: Schema.Types.ObjectId },
        },

        priority: {
            type: String,
            enum: ['low', 'medium', 'high', 'critical'],
            default: 'medium',
            required: true,
        },

        status: {
            type: String,
            enum: ['open', 'in_review', 'waiting_user', 'resolved', 'closed'],
            default: 'open',
            required: true,
        },

        slaDeadline: { type: Date, required: true },
    },
    {
        timestamps: true,                    // createdAt + updatedAt
    }
);

// ─── Compound Index: status + priority ───
SupportTicketSchema.index({ status: 1, priority: -1 });

// ─── Prevent deletion (soft-only) ───
// Override deleteOne / deleteMany / findOneAndDelete to reject
const blockDelete = function (this: any, next: any) {
    next(new Error('Support tickets cannot be deleted'));
};

SupportTicketSchema.pre('deleteOne', blockDelete);
SupportTicketSchema.pre('findOneAndDelete', blockDelete);

export const SupportTicket = mongoose.model<ISupportTicket>(
    'SupportTicket',
    SupportTicketSchema
);
export default SupportTicket;
