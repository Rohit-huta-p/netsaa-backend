import { Request, Response } from 'express';
import User from '../models/User';
import SavedTalent from '../models/SavedTalent';

const DIRECTORY_ROLES = ['artist', 'creative_lead']; // mirror directory.controller wall

// Same card projection + mapping as the directory, so the Saved list looks identical.
const CARD_SELECT = 'displayName profileImageUrl role artistType headline location cached trustTier';
const toCard = (u: any) => ({
    _id: String(u._id),
    displayName: u.displayName || 'NETSA member',
    profileImageUrl: u.profileImageUrl,
    role: u.role,
    artType: Array.isArray(u.artistType) ? u.artistType[0] : u.artistType,
    headline: u.headline,
    city: u.cached?.primaryCity || u.location,
    trustTier: u.trustTier,
});

const viewerId = (req: Request) => String((req as any).user?.id || (req as any).user?._id);

/**
 * POST /api/users/saved  { talentId }
 * Bookmark a directory talent. Idempotent (unique compound index + upsert). 201.
 */
export const saveTalent = async (req: Request, res: Response) => {
    try {
        const { talentId } = (req.body || {}) as { talentId?: string };
        const me = viewerId(req);

        if (!talentId || !/^[0-9a-fA-F]{24}$/.test(talentId)) {
            return res.status(400).json({ meta: { status: 400, message: 'Invalid talentId' }, data: null, errors: [] });
        }
        if (talentId === me) {
            return res.status(400).json({ meta: { status: 400, message: 'Cannot save yourself' }, data: null, errors: [] });
        }

        // Target must be an existing, non-blocked directory user (artist / creative_lead).
        const target = await User.findOne({ _id: talentId, role: { $in: DIRECTORY_ROLES }, blocked: { $ne: true } })
            .select('_id')
            .lean();
        if (!target) {
            return res.status(404).json({ meta: { status: 404, message: 'Talent not found' }, data: null, errors: [] });
        }

        await SavedTalent.findOneAndUpdate(
            { user: me, talent: talentId },
            { $setOnInsert: { user: me, talent: talentId } },
            { upsert: true, new: true, setDefaultsOnInsert: true },
        );

        return res.status(201).json({ meta: { status: 201, message: 'Saved' }, data: { saved: true }, errors: [] });
    } catch (err: any) {
        console.error('[SavedTalent] save error:', err.message);
        return res.status(500).json({ meta: { status: 500, message: 'Server error' }, data: null, errors: [] });
    }
};

/**
 * DELETE /api/users/saved/:talentId
 * Remove a bookmark. Idempotent. 200.
 */
export const unsaveTalent = async (req: Request, res: Response) => {
    try {
        const { talentId } = req.params;
        const me = viewerId(req);

        if (!talentId || !/^[0-9a-fA-F]{24}$/.test(talentId)) {
            return res.status(400).json({ meta: { status: 400, message: 'Invalid talentId' }, data: null, errors: [] });
        }

        await SavedTalent.deleteOne({ user: me, talent: talentId });

        return res.json({ meta: { status: 200, message: 'Unsaved' }, data: { saved: false }, errors: [] });
    } catch (err: any) {
        console.error('[SavedTalent] unsave error:', err.message);
        return res.status(500).json({ meta: { status: 500, message: 'Server error' }, data: null, errors: [] });
    }
};

/**
 * GET /api/users/saved
 * This viewer's saved talent (newest first), as directory cards.
 * Drops any whose user is now missing or blocked. Returns { people }.
 */
export const getSavedTalent = async (req: Request, res: Response) => {
    try {
        const me = viewerId(req);

        const saved = await SavedTalent.find({ user: me })
            .sort({ createdAt: -1 })
            .select('talent')
            .lean();

        const ids = (saved as any[]).map((s) => s.talent);
        if (!ids.length) {
            return res.json({ meta: { status: 200, message: 'OK' }, data: { people: [] }, errors: [] });
        }

        // Look up live talent docs, dropping missing / blocked ones via the query.
        const docs = await User.find({ _id: { $in: ids }, blocked: { $ne: true } })
            .select(CARD_SELECT)
            .lean();

        // Preserve the savedAt (newest-first) order from the SavedTalent rows.
        const byId = new Map((docs as any[]).map((u) => [String(u._id), u]));
        const people = ids
            .map((id) => byId.get(String(id)))
            .filter(Boolean)
            .map(toCard);

        return res.json({ meta: { status: 200, message: 'OK' }, data: { people }, errors: [] });
    } catch (err: any) {
        console.error('[SavedTalent] list error:', err.message);
        return res.status(500).json({ meta: { status: 500, message: 'Server error' }, data: null, errors: [] });
    }
};

/**
 * GET /api/users/saved/ids
 * This viewer's saved talentIds as strings (to mark the directory cheaply). { ids }.
 */
export const getSavedIds = async (req: Request, res: Response) => {
    try {
        const me = viewerId(req);

        const saved = await SavedTalent.find({ user: me }).select('talent').lean();
        const ids = (saved as any[]).map((s) => String(s.talent));

        return res.json({ meta: { status: 200, message: 'OK' }, data: { ids }, errors: [] });
    } catch (err: any) {
        console.error('[SavedTalent] ids error:', err.message);
        return res.status(500).json({ meta: { status: 500, message: 'Server error' }, data: null, errors: [] });
    }
};
