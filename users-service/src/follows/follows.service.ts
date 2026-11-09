import Follow from './follows.model';
import { FollowError } from './follows.errors';
import { notificationEvents } from '../notifications';

export interface FollowState {
    isFollowing: boolean;
    followerCount: number;
}

class FollowsService {
    /**
     * Follow `followeeId` as `followerId`. Idempotent and race-safe: an upsert
     * with $setOnInsert means "already following" is a no-op, and a concurrent
     * duplicate (E11000) is swallowed. Returns the resulting state.
     */
    async follow(followerId: string, followeeId: string): Promise<FollowState> {
        if (followerId === followeeId) {
            throw new FollowError('You cannot follow yourself.', 400);
        }
        // Whether THIS call created the follow (vs. it already existing). Only a
        // brand-new follow should notify the followee — re-follows are no-ops.
        let isNewFollow = false;
        try {
            const result = await Follow.updateOne(
                { followerId, followeeId },
                { $setOnInsert: { followerId, followeeId } },
                { upsert: true }
            );
            isNewFollow = (result.upsertedCount ?? 0) > 0;
        } catch (err: any) {
            // 11000 = duplicate key from a concurrent follow → already following, fine.
            if (err?.code !== 11000) throw err;
        }

        // Fire-and-forget: tell the followee they have a new follower.
        if (isNewFollow) {
            notificationEvents.emitFollowStarted({ recipientId: followeeId, actorId: followerId });
        }

        const followerCount = await Follow.countDocuments({ followeeId });
        return { isFollowing: true, followerCount };
    }

    /**
     * All follower user-ids for `followeeId`. Used by the internal fan-out
     * endpoint when the followee publishes a gig/event. Returns a plain string[]
     * (ids only) — the notification pipeline resolves display data on read.
     */
    async getFollowerIds(followeeId: string): Promise<string[]> {
        const docs = await Follow.find({ followeeId }).select('followerId').lean();
        return docs.map((d: any) => d.followerId.toString());
    }

    /**
     * Unfollow `followeeId`. Idempotent — removing a follow that isn't there
     * resolves cleanly (deleteOne is a no-op).
     */
    async unfollow(followerId: string, followeeId: string): Promise<FollowState> {
        await Follow.deleteOne({ followerId, followeeId });
        const followerCount = await Follow.countDocuments({ followeeId });
        return { isFollowing: false, followerCount };
    }

    /**
     * Whether `followerId` follows `followeeId`, plus the followee's total
     * follower count (shown on the profile for any viewer).
     */
    async getStatus(followerId: string, followeeId: string): Promise<FollowState> {
        const [doc, followerCount] = await Promise.all([
            Follow.findOne({ followerId, followeeId }).lean(),
            Follow.countDocuments({ followeeId }),
        ]);
        return { isFollowing: !!doc, followerCount };
    }
}

export default new FollowsService();
