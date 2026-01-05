import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IGigComment extends Document {
    collectionType: 'gig' | 'event';
    topicId: mongoose.Types.ObjectId;
    text: string;
    authorId: mongoose.Types.ObjectId;
    authorName: string;
    authorImageUrl?: string;
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
    },
    { timestamps: true }
);

// Indexes
gigCommentSchema.index({ topicId: 1 });
gigCommentSchema.index({ collectionType: 1 });
gigCommentSchema.index({ authorId: 1 });

const GigComment: Model<IGigComment> = mongoose.model<IGigComment>('GigComment', gigCommentSchema);

export default GigComment;
