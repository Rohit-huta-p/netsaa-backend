import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IGigComment extends Document {
    collectionType: 'gig' | 'event';
    topicId: mongoose.Types.ObjectId;
    text: string;
    authorId: mongoose.Types.ObjectId;
    authorName: string;
    authorImageUrl?: string;
    // Threading: null for a top-level question; the thread-root comment id for a
    // reply. Flat, one level only — a reply always points at the root (never at
    // another reply). Gig-only; event comments stay flat (parentId stays null).
    parentId?: mongoose.Types.ObjectId | null;
    // Moderation (gig): pin is owner-only (cap 3); soft-delete masks the body
    // and records who removed it. Optional so existing/event rows are unaffected.
    isPinned?: boolean;
    pinnedAt?: Date;
    pinnedBy?: mongoose.Types.ObjectId;
    isDeleted?: boolean;
    deletedAt?: Date;
    deletedReason?: 'self' | 'organizer' | 'admin';
    createdAt: Date;
    updatedAt: Date;
}

const gigCommentSchema = new Schema<IGigComment>(
    {
        collectionType: {
            type: String,
            enum: ['gig', 'event'],
            required: true
        },
        topicId: { type: Schema.Types.ObjectId, required: true },
        text: { type: String, required: true },
        authorId: { type: Schema.Types.ObjectId, required: true },
        authorName: { type: String, required: true },
        authorImageUrl: { type: String },
        parentId: { type: Schema.Types.ObjectId, ref: 'GigComment', default: null },
        isPinned: { type: Boolean, default: false },
        pinnedAt: { type: Date },
        pinnedBy: { type: Schema.Types.ObjectId, ref: 'User' },
        isDeleted: { type: Boolean, default: false },
        deletedAt: { type: Date },
        deletedReason: { type: String, enum: ['self', 'organizer', 'admin'] },
    },
    { timestamps: true }
);

// Indexes
gigCommentSchema.index({ topicId: 1 });
gigCommentSchema.index({ collectionType: 1 });
gigCommentSchema.index({ authorId: 1 });
gigCommentSchema.index({ parentId: 1 }); // threads are grouped by parentId

const GigComment: Model<IGigComment> = mongoose.model<IGigComment>('GigComment', gigCommentSchema);

export default GigComment;
