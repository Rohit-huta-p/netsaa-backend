import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IEventStats extends Document {
    eventId: mongoose.Types.ObjectId;
    views: number;
    registrations: number;
    saves: number;
    updatedAt: Date;
}

const eventStatsSchema = new Schema<IEventStats>(
    {
        eventId: { type: Schema.Types.ObjectId, ref: 'Event', required: true, unique: true },
        views: { type: Number, default: 0 },
        registrations: { type: Number, default: 0 },
        saves: { type: Number, default: 0 },
    },
    { timestamps: true }
);

// Indexes
eventStatsSchema.index({ eventId: 1 }, { unique: true });

const EventStats: Model<IEventStats> = mongoose.model<IEventStats>('EventStats', eventStatsSchema);

export default EventStats;
