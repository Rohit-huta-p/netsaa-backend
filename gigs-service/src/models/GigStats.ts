import mongoose, { Schema, Document } from 'mongoose';

export interface IGigStats extends Document {
    gigId: mongoose.Types.ObjectId;
    views: number;
    applications: number;
    shortlisted: number;
    hired: number;
    saves: number;
    lastViewedAt: Date;
    updatedAt: Date;
}

const GigStatsSchema = new Schema<IGigStats>({
    gigId: { type: Schema.Types.ObjectId, ref: 'Gig', required: true, unique: true },
    views: { type: Number, default: 0 },
    applications: { type: Number, default: 0 },
    shortlisted: { type: Number, default: 0 },
    hired: { type: Number, default: 0 },
    saves: { type: Number, default: 0 },
    lastViewedAt: Date,
}, { timestamps: true });

export const GigStats = mongoose.model<IGigStats>('GigStats', GigStatsSchema);
export default GigStats;
