import mongoose, { Schema, Document } from 'mongoose';

export interface IConnection extends Document {
    requesterId: mongoose.Types.ObjectId;
    recipientId: mongoose.Types.ObjectId;
    status: 'pending' | 'accepted' | 'rejected' | 'blocked';
    message?: string;
    createdAt: Date;
    updatedAt: Date;
}

const ConnectionSchema: Schema = new Schema(
    {
        requesterId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        recipientId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        status: {
            type: String,
            enum: ['pending', 'accepted', 'rejected', 'blocked'],
            default: 'pending',
            index: true,
        },
        message: {
            type: String,
            required: false,
        },
    },
    {
        timestamps: true,
    }
);

// Compound unique index to prevent duplicate connections between the same two users
ConnectionSchema.index({ requesterId: 1, recipientId: 1 }, { unique: true });

const Connection = mongoose.model<IConnection>('Connection', ConnectionSchema);

export default Connection;
