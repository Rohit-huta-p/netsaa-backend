import mongoose, { Schema, Document, Model } from 'mongoose';

/**
 * GigComment — discussion thread for a gig or event.
 *
 * Apr 30: added moderation fields (Apr 30 redesign):
 *   - isPinned + pinnedAt + pinnedBy → gig owner can pin up to 3 messages.
 *     Pinned-first sort happens at controller level (GET /discussion).
 *   - isDeleted + deletedAt + deletedBy + deletedReason → soft-delete model
 *     so threads stay coherent when an author/org/admin removes a message.
 *     Frontend masks the body as "[deleted]" when isDeleted is true.
 */
export interface IGigComment extends Document {
    collectionType: 'gig' | 'event';
    topicId: mongoose.Types.ObjectId;
    text: string;
    authorId: mongoose.Types.ObjectId;
    authorName: string;
    authorImageUrl?: string;

    // Moderation
    isPinned: boolean;
    pinnedAt?: Date;
    pinnedBy?: mongoose.Types.ObjectId;
    isDeleted: boolean;
    deletedAt?: Date;
    deletedBy?: mongoose.Types.ObjectId;
    /**
     * One of: 'self' | 'organizer' | 'admin'. Matches the role that performed
     * the delete so the frontend can render a contextual placeholder
     * ("Removed by organizer" vs "Removed by author").
     */
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

        // Moderation fields
        isPinned: { type: Boolean, default: false, index: true },
        pinnedAt: { type: Date },
        pinnedBy: { type: Schema.Types.ObjectId },
        isDeleted: { type: Boolean, default: false },
        deletedAt: { type: Date },
        deletedBy: { type: Schema.Types.ObjectId },
        deletedReason: { type: String, enum: ['self', 'organizer', 'admin'] },
    },
    { timestamps: true }
);

// Indexes
gigCommentSchema.index({ topicId: 1 });
gigCommentSchema.index({ collectionType: 1 });
gigCommentSchema.index({ authorId: 1 });
// Compound index — speeds up the pinned-first sort on the discussion fetch.
gigCommentSchema.index({ topicId: 1, isPinned: -1, createdAt: 1 });

const GigComment: Model<IGigComment> = mongoose.model<IGigComment>('GigComment', gigCommentSchema);

export default GigComment;
