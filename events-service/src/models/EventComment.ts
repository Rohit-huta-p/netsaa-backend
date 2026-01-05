import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IEventComment extends Document {
    collectionType: 'gig' | 'event';
    topicId: mongoose.Types.ObjectId;
    text: string;
    authorId: mongoose.Types.ObjectId;
    authorName: string;
    authorImageUrl?: string;
    createdAt: Date;
    updatedAt: Date;
}

const eventCommentSchema = new Schema<IEventComment>(
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
eventCommentSchema.index({ topicId: 1 });
eventCommentSchema.index({ collectionType: 1 });
eventCommentSchema.index({ authorId: 1 });

const EventComment: Model<IEventComment> = mongoose.model<IEventComment>('EventComment', eventCommentSchema);

export default EventComment;
