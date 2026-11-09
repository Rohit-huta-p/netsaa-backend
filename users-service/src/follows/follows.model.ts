import mongoose, { Schema, Document } from 'mongoose';

/**
 * A one-way, instant subscription: `followerId` follows `followeeId` to get
 * notified when that user/organization posts (gigs, events). Distinct from a
 * Connection (which is mutual and needs acceptance). No approval, no status —
 * a row exists iff the follow is active.
 */
export interface IFollow extends Document {
    followerId: mongoose.Types.ObjectId; // the user doing the following
    followeeId: mongoose.Types.ObjectId; // the user/org being followed
    createdAt: Date;
    updatedAt: Date;
}

const FollowSchema: Schema = new Schema(
    {
        followerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        followeeId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
    },
    {
        timestamps: true,
    }
);

// One follow per (follower, followee) pair — makes follow idempotent and
// counting a plain countDocuments.
FollowSchema.index({ followerId: 1, followeeId: 1 }, { unique: true });

const Follow = mongoose.model<IFollow>('Follow', FollowSchema);

export default Follow;
