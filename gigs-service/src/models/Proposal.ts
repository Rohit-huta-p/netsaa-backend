// src/models/Proposal.ts
import mongoose, { Schema, Document } from 'mongoose';

export type ProposalStatus = 'sent' | 'viewed' | 'accepted' | 'declined' | 'withdrawn';

export interface IProposal extends Document {
    requirementId: mongoose.Types.ObjectId;
    leadId: mongoose.Types.ObjectId;
    leadSnapshot: {
        displayName: string;
        profileImageUrl?: string;
        trustTier?: string;
        rating?: number;
    };
    pitch: string;
    quoteAmount?: number | null;
    portfolioLinks: string[];
    status: ProposalStatus;
    timeline: Array<{ event: string; at: Date }>;
    createdAt: Date;
    updatedAt: Date;
}

const ProposalSchema = new Schema<IProposal>(
    {
        requirementId: { type: Schema.Types.ObjectId, ref: 'Requirement', required: true },
        leadId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        leadSnapshot: {
            displayName: { type: String, required: true },
            profileImageUrl: { type: String },
            trustTier: { type: String },
            rating: { type: Number },
        },
        pitch: { type: String, required: true, minlength: 20, maxlength: 1500 },
        quoteAmount: { type: Number, default: null },
        portfolioLinks: { type: [String], default: [] },
        status: {
            type: String,
            enum: ['sent', 'viewed', 'accepted', 'declined', 'withdrawn'],
            default: 'sent',
        },
        timeline: { type: [{ event: String, at: Date }], default: [] },
    },
    { timestamps: true }
);

ProposalSchema.index({ requirementId: 1, status: 1 });
ProposalSchema.index({ leadId: 1, createdAt: -1 });
ProposalSchema.index({ requirementId: 1, leadId: 1 }, { unique: true }); // one proposal per CL

export default mongoose.model<IProposal>('Proposal', ProposalSchema);
