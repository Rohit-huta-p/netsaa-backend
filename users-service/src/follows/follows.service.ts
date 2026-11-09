import Follow from './follows.model';
import { FollowError } from './follows.errors';

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
        try {
            await Follow.updateOne(
                { followerId, followeeId },
                { $setOnInsert: { followerId, followeeId } },
                { upsert: true }
            );
        } catch (err: any) {
            // 11000 = duplicate key from a concurrent follow → already following, fine.
            if (err?.code !== 11000) throw err;
        }
        const followerCount = await Follow.countDocuments({ followeeId });
        return { isFollowing: true, followerCount };
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
