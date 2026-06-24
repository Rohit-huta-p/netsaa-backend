// src/models/Invite.ts
import mongoose, { Schema, Document } from 'mongoose';

/**
 * Client-initiated invites (Part B). Two shapes:
 *  - requirement-attached (requirementId set): invite someone to propose on a specific requirement.
 *  - context-free (requirementId null + note): "I'd like to work with you".
 * The per-invite wall exception (proposalController) keys off a requirement-attached
 * invite to let an INVITED ARTIST propose on exactly that requirement.
 */
export type InviteStatus = 'sent' | 'viewed' | 'accepted' | 'declined' | 'withdrawn';

export interface IInvite extends Document {
    fromClientId: mongoose.Types.ObjectId;
    fromSnapshot: { displayName: string; city?: string };
    toUserId: mongoose.Types.ObjectId;
    // Denormalized recipient, captured at create time (mirrors fromSnapshot) so the
    // sender's "sent" list can show the performer without a join. Fields are optional:
    // a recipient may have no displayName/avatar/city set yet.
    toSnapshot?: { displayName?: string; avatarUrl?: string; city?: string };
    toRole: 'artist' | 'creative_lead' | 'agency';
    requirementId?: mongoose.Types.ObjectId | null;
    requirementTitle?: string; // denormalized for the recipient inbox
    note?: string;
    status: InviteStatus;
    createdAt: Date;
    updatedAt: Date;
}

const InviteSchema = new Schema<IInvite>(
    {
        fromClientId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        fromSnapshot: {
            displayName: { type: String, required: true },
            city: { type: String },
        },
        toUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        toSnapshot: {
            displayName: { type: String },
            avatarUrl: { type: String },
            city: { type: String },
        },
        toRole: { type: String, enum: ['artist', 'creative_lead', 'agency'], required: true },
        requirementId: { type: Schema.Types.ObjectId, ref: 'Requirement', default: null },
        requirementTitle: { type: String },
        note: { type: String, maxlength: 500 },
        status: { type: String, enum: ['sent', 'viewed', 'accepted', 'declined', 'withdrawn'], default: 'sent' },
    },
    { timestamps: true },
);

InviteSchema.index({ toUserId: 1, status: 1, createdAt: -1 }); // recipient inbox
InviteSchema.index({ fromClientId: 1, createdAt: -1 });         // sender list
// One live invite per (client, recipient, requirement) — prevents invite spam.
InviteSchema.index(
    { fromClientId: 1, toUserId: 1, requirementId: 1 },
    { unique: true, partialFilterExpression: { status: { $in: ['sent', 'viewed', 'accepted'] } } },
);

export default mongoose.model<IInvite>('Invite', InviteSchema);
