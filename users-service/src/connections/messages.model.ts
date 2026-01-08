import mongoose, { Schema, Document } from 'mongoose';

export interface IAttachment {
    type: string;
    url: string;
    size: number;
}

export interface IMessage extends Document {
    conversationId: mongoose.Types.ObjectId;
    senderId: mongoose.Types.ObjectId;
    text?: string;
    attachments?: IAttachment[];
    seenBy: mongoose.Types.ObjectId[];
    clientMessageId?: string;
    createdAt: Date;
    updatedAt: Date;
}

const MessageSchema: Schema = new Schema(
    {
        conversationId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Conversation',
            required: true,
        },
        senderId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        text: {
            type: String,
            required: false,
        },
        attachments: [
            {
                type: { type: String },
                url: { type: String },
                size: { type: Number },
            },
        ],
        seenBy: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User',
            },
        ],
        clientMessageId: {
            type: String,
            required: false,
        },
    },
    {
        timestamps: true,
    }
);

// Indexes
MessageSchema.index({ conversationId: 1, createdAt: 1 });
MessageSchema.index({ clientMessageId: 1 }, { sparse: true });
// Optimize markMessagesSeen to skip own messages
MessageSchema.index({ conversationId: 1, senderId: 1 });

const Message = mongoose.model<IMessage>('Message', MessageSchema);

export default Message;
