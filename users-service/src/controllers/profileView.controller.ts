import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import ProfileView from '../models/ProfileView';
import Artist from '../models/Artist';
import User from '../models/User';
import { notificationEvents } from '../notifications/event.emitter';

/** UTC calendar day, 'YYYY-MM-DD'. */
function utcDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** POST /api/users/:id/view — record a (deduped) profile view. */
export const recordProfileView = async (req: AuthRequest, res: Response) => {
  try {
    const viewerId = String(req.user!._id);
    const viewedUserId = req.params.id;

    if (viewerId === String(viewedUserId)) {
      return res.status(204).send(); // ignore self-views (checked before format so a self-view never 400s)
    }
    if (!/^[0-9a-fA-F]{24}$/.test(viewedUserId)) {
      return res.status(400).json({ meta: { status: 400, message: 'Invalid user id' }, data: null, errors: [] });
    }

    const day = utcDay(new Date());
    const result: any = await ProfileView.updateOne(
      { viewerId, viewedUserId, day },
      { $setOnInsert: { at: new Date() } },
      { upsert: true }
    );

    // Only the first unique-day view bumps the cached lifetime counter.
    // No upsert on Artist: non-artist targets simply don't accumulate views.
    if (result?.upsertedCount && result.upsertedCount > 0) {
      // NOTE: the ProfileView upsert above and this counter increment are two
      // separate, non-atomic writes (no Mongo transaction). If this $inc
      // throws after the dedup row has already been persisted, that first
      // view is permanently undercounted — there is no retry, since the
      // client's POST /:id/view call is fire-and-forget (authService.ts
      // swallows the error). Accepted trade-off for a vanity counter; future
      // hardening would be wrapping both writes in a Mongo transaction, or a
      // periodic reconciliation job that recomputes stats.profileViews from
      // the ProfileView collection.
      await Artist.findOneAndUpdate(
        { userId: viewedUserId },
        { $inc: { 'stats.profileViews': 1 } }
      );

      // Notify the profile owner — first view of the day by this viewer
      // (self-views already excluded above). Best-effort: a notify failure
      // must never break the fire-and-forget view record.
      try {
        const viewer: any = await User.findById(viewerId).select('displayName').lean();
        notificationEvents.emitProfileViewed({
          viewedUserId: String(viewedUserId),
          viewerId,
          viewerName: viewer?.displayName || 'Someone',
        });
      } catch (notifyErr: any) {
        console.warn('[ProfileView] notify failed:', notifyErr?.message);
      }
    }
    return res.status(204).send();
  } catch (err: any) {
    if (err?.code === 11000) return res.status(204).send(); // race on the unique index — already counted
    console.error('[ProfileView] record error:', err.message);
    return res.status(500).json({ meta: { status: 500, message: 'Server error' }, data: null, errors: [] });
  }
};

/** GET /api/users/me/profile-views — { total (lifetime), last7 (weekly delta) }. */
export const getMyProfileViews = async (req: AuthRequest, res: Response) => {
  try {
    const me = String(req.user!._id);
    const artist: any = await Artist.findOne({ userId: me }).select('stats.profileViews').lean();
    const total = artist?.stats?.profileViews ?? 0;
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const last7 = await ProfileView.countDocuments({ viewedUserId: me, at: { $gte: sevenDaysAgo } });
    return res.json({ meta: { status: 200, message: 'OK' }, data: { total, last7 }, errors: [] });
  } catch (err: any) {
    console.error('[ProfileView] summary error:', err.message);
    return res.status(500).json({ meta: { status: 500, message: 'Server error' }, data: null, errors: [] });
  }
};
