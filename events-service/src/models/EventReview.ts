import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IEventReview extends Document {
    eventId: mongoose.Types.ObjectId;
    registrationId: mongoose.Types.ObjectId;
    attendeeId: mongoose.Types.ObjectId;       // userId of the reviewer
    organizerId: mongoose.Types.ObjectId;      // duplicated for fast organizer queries

    rating: number;                            // 1-5
    body?: string;                             // max 500 chars

    // Q6 · honesty signal for multi-day events
    attendedDays: number;                      // how many days the attendee actually checked in
    totalDays: number;                         // total days in the event (1 for single-day)

    // Moderation
    isPublic: boolean;                         // hidden by admin if reported
    reportedCount: number;
    moderationStatus: 'visible' | 'hidden' | 'pending_review';

    submittedAt: Date;
    createdAt: Date;
    updatedAt: Date;
}

const eventReviewSchema = new Schema<IEventReview>(
    {
        eventId: { type: Schema.Types.ObjectId, ref: 'Event', required: true },
        registrationId: { type: Schema.Types.ObjectId, ref: 'EventRegistration', required: true },
        attendeeId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        organizerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },

        rating: { type: Number, required: true, min: 1, max: 5 },
        body: { type: String, maxlength: 500 },

        attendedDays: { type: Number, required: true, min: 0 },
        totalDays: { type: Number, required: true, min: 1 },

        isPublic: { type: Boolean, default: true },
        reportedCount: { type: Number, default: 0 },
        moderationStatus: {
            type: String,
            enum: ['visible', 'hidden', 'pending_review'],
            default: 'visible',
        },

        submittedAt: { type: Date, default: Date.now },
    },
    { timestamps: true }
);

// Indexes
eventReviewSchema.index({ registrationId: 1 }, { unique: true });        // one review per registration
eventReviewSchema.index({ eventId: 1, moderationStatus: 1 });            // event review list
eventReviewSchema.index({ organizerId: 1, rating: -1 });                 // organizer Trust score aggregation
eventReviewSchema.index({ attendeeId: 1 });                              // user's reviews
eventReviewSchema.index({ submittedAt: -1 });                            // recent reviews global feed

const EventReview: Model<IEventReview> = mongoose.model<IEventReview>(
    'EventReview',
    eventReviewSchema
);

export default EventReview;
