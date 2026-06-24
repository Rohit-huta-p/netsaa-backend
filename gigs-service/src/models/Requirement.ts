// src/models/Requirement.ts
import mongoose, { Schema, Document } from 'mongoose';

/**
 * Client requirements (2026-06 client onboarding). NOT gigs: the structural
 * wall — gigs are CL->Artist only; requirements are Client->CL only.
 */
export const PROPOSAL_CAP = 5; // spec decision 9 — tune with data

export type RequirementStatus = 'open' | 'in_discussion' | 'booked' | 'closed' | 'cancelled' | 'expired';

export interface IRequirement extends Document {
    clientId: mongoose.Types.ObjectId;
    clientSnapshot: { displayName: string; city?: string; hirerType?: string };
    title?: string;
    occasionText: string;
    occasionTag?: string | null;
    description: string;
    city: string;
    eventDate: Date;
    budgetMin?: number | null;
    budgetMax?: number | null;
    photos: string[];
    status: RequirementStatus;
    proposalCount: number;
    createdAt: Date;
    updatedAt: Date;
    expiresAt: Date;
}

const RequirementSchema = new Schema<IRequirement>(
    {
        clientId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        clientSnapshot: {
            displayName: { type: String, required: true },
            city: { type: String },
            hirerType: { type: String },
        },
        title: { type: String, trim: true, maxlength: 100 },
        occasionText: { type: String, required: true, trim: true, maxlength: 80 },
        occasionTag: { type: String, default: null },
        description: { type: String, required: true, minlength: 20, maxlength: 2000 },
        city: { type: String, required: true, trim: true },
        eventDate: { type: Date, required: true },
        budgetMin: { type: Number, default: null },
        budgetMax: { type: Number, default: null },
        photos: { type: [String], default: [] },
        status: {
            type: String,
            // expired: set by a future cron; feed queries already exclude past-expiresAt docs
            enum: ['open', 'in_discussion', 'booked', 'closed', 'cancelled', 'expired'],
            default: 'open',
        },
        proposalCount: { type: Number, default: 0 },
        expiresAt: { type: Date, required: true },
    },
    { timestamps: true }
);

RequirementSchema.index({ clientId: 1, createdAt: -1 });
RequirementSchema.index({ status: 1, city: 1, eventDate: 1 });

export default mongoose.model<IRequirement>('Requirement', RequirementSchema);
