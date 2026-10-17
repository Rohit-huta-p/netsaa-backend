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
