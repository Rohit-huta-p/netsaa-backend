import mongoose, { Schema, Document } from 'mongoose';

// ─── Interface ───
export interface ISupportMessage extends Document {
    ticketId: mongoose.Types.ObjectId;

    senderType: 'user' | 'admin';
    senderId: mongoose.Types.ObjectId;

    message: string;

    attachments: {
        fileName: string;
        fileUrl: string;
        fileType: string;
        fileSize: number;
    }[];

    createdAt: Date;
}

// ─── Schema ───
const SupportMessageSchema = new Schema<ISupportMessage>(
    {
        ticketId: {
            type: Schema.Types.ObjectId,
            ref: 'SupportTicket',
            required: true,
            index: true,
        },

        senderType: {
            type: String,
            enum: ['user', 'admin'],
            required: true,
        },

        senderId: {
            type: Schema.Types.ObjectId,
            required: true,
        },

        message: { type: String, required: true },

        attachments: [
            {
                fileName: { type: String, required: true },
                fileUrl: { type: String, required: true },
                fileType: { type: String, required: true },
                fileSize: { type: Number, required: true },
            },
        ],
    },
    {
        timestamps: { createdAt: true, updatedAt: false },
    }
);

// ─── Index: ticketId + createdAt for thread ordering ───
SupportMessageSchema.index({ ticketId: 1, createdAt: 1 });

export const SupportMessage = mongoose.model<ISupportMessage>(
    'SupportMessage',
    SupportMessageSchema
);
export default SupportMessage;
