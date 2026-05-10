import mongoose, { Schema, Document } from 'mongoose';

export const TAG_STATUSES = ['seed', 'pending', 'approved', 'blocked'] as const;

export interface IEventTag extends Document {
    _id: string;                            // normalized lowercase
    displayName: string;                    // Title Case for UI
    status: typeof TAG_STATUSES[number];
    usageCount: number;
    createdBy: mongoose.Types.ObjectId | 'system';
    approvedAt?: Date;
    approvedBy?: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const EventTagSchema = new Schema<IEventTag>({
    _id: {
        type: String,
        required: true,
        validate: {
            validator: (v: string) => /^[a-z0-9-]{1,30}$/.test(v),
            message: '_id must be lowercase alphanumeric/hyphen, max 30 chars (use normalizeTag util)',
        },
    },
    displayName: { type: String, required: true, maxlength: 60 },
    status: { type: String, enum: TAG_STATUSES, required: true, default: 'pending', index: true },
    usageCount: { type: Number, default: 0, index: true },
    createdBy: { type: Schema.Types.Mixed },
    approvedAt: { type: Date },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
}, {
    timestamps: true,
    _id: false,
});

EventTagSchema.index({ status: 1, usageCount: -1 });

export default mongoose.model<IEventTag>('EventTag', EventTagSchema);
