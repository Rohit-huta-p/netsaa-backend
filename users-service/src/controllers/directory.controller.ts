import { Request, Response } from 'express';
import mongoose from 'mongoose';
import User from '../models/User';

// Directory membership (privacy-critical):
//   - artist / creative_lead  → always eligible
//   - client                  → eligible ONLY when its Organizer is an agency
//     (organizerTypeCategory === 'agency'). Individual / non-agency business
//     clients (and clients with no Organizer doc) must NEVER appear.
const DIRECTORY_ROLES = ['artist', 'creative_lead']; // role values surfaced as-is
const ALL_KINDS = ['artist', 'creative_lead', 'agency'];

/**
 * GET /api/users/directory
 * People directory for the client Talent screen. Public fields only.
 * Surfaces artists, creative leads, AND agency-clients (role=client whose
 * Organizer is an agency). Built with an aggregation so we can $lookup the
 * organizers collection and label agencies.
 *
 * Query: role (artist|creative_lead|agency), city (CSV), artType (CSV), q,
 *        trust (trusted|verified), hasMedia, experienceLevel (CSV), gender,
 *        sort (trust|experience), page, pageSize.
 * Returns { people, page, pageSize, total }.
 */
export const getDirectory = async (req: Request, res: Response) => {
    try {
        const {
            role, city, artType, q, sort,
            trust, hasMedia, experienceLevel, gender,
            page = '1', pageSize = '20',
        } = req.query as Record<string, string>;

        const pipeline: any[] = [];

        // Cheap pre-filter: drop blocked users and anything that is neither an
        // artist/CL nor a client BEFORE the $lookup (clients still need the org
        // check below; non-client/non-artist roles can never qualify).
        const baseMatch: any = {
            blocked: { $ne: true },
            role: { $in: [...DIRECTORY_ROLES, 'client'] },
        };

        // Never list the viewer's own profile. `protect` sets req.user to the
        // User doc, so req.user._id is the ObjectId; guard isValid so the test
        // auth-mock (or any malformed id) can't throw.
        const selfId = (req as any).user?._id ?? (req as any).user?.id;
        if (selfId && mongoose.Types.ObjectId.isValid(String(selfId))) {
            baseMatch._id = { $ne: new mongoose.Types.ObjectId(String(selfId)) };
        }

        pipeline.push({ $match: baseMatch });

        // Join the organizer doc (one per user; userId is unique). Keep users
        // with no org so the membership $match can reject them explicitly.
        pipeline.push({
            $lookup: {
                from: 'organizers',
                localField: '_id',
                foreignField: 'userId',
                as: 'org',
            },
        });
        pipeline.push({ $unwind: { path: '$org', preserveNullAndEmptyArrays: true } });

        // Derive `kind`: agency when client+agency-org, otherwise the raw role.
        pipeline.push({
            $addFields: {
                kind: {
                    $cond: [
                        {
                            $and: [
                                { $eq: ['$role', 'client'] },
                                { $eq: ['$org.organizerTypeCategory', 'agency'] },
                            ],
                        },
                        'agency',
                        '$role',
                    ],
                },
            },
        });

        // PRIVACY GUARD: a row is in the directory iff it is an artist, a
        // creative_lead, or an agency. Any client whose org is not an agency
        // (individual, academy, venue, …) or who has no org collapses to
        // kind === 'client' and is dropped here — never leaked.
        //
        // VIEWER SCOPE: a creative_lead hires artists DOWN the chain, so agencies
        // (client-layer suppliers) are hidden from CL viewers entirely. Clients,
        // artists and admins keep the full set. (CLs became directory consumers
        // when the Talent tab was added to their nav.)
        const viewerRole = (req as any).user?.role;
        const visibleKinds =
            viewerRole === 'creative_lead' ? ALL_KINDS.filter((k) => k !== 'agency') : ALL_KINDS;
        pipeline.push({ $match: { kind: { $in: visibleKinds } } });

        // Role param narrows on `kind` within the viewer-visible set. A CL asking
        // for role=agency therefore matches nothing (agencies already excluded).
        if (role && ALL_KINDS.includes(role)) {
            pipeline.push({ $match: { kind: role } });
        }

        // Craft — multi (CSV → $in). Naturally excludes agencies (no artistType).
        if (artType) {
            const crafts = String(artType).split(',').map((s) => s.trim()).filter(Boolean);
            if (crafts.length === 1) pipeline.push({ $match: { artistType: crafts[0] } });
            else if (crafts.length > 1) pipeline.push({ $match: { artistType: { $in: crafts } } });
        }

        // Experience — multi (CSV → $in).
        if (experienceLevel) {
            const levels = String(experienceLevel).split(',').map((s) => s.trim()).filter(Boolean);
            if (levels.length) pipeline.push({ $match: { experienceLevel: { $in: levels } } });
        }

        // Gender — single exact.
        if (gender) pipeline.push({ $match: { gender } });

        // Trust — threshold.
        if (trust === 'verified') pipeline.push({ $match: { trustTier: 'verified' } });
        else if (trust === 'trusted') pipeline.push({ $match: { trustTier: { $in: ['trusted', 'verified'] } } });

        // City — multi (CSV): OR over (each city × location / cached.primaryCity).
        // Organizer has no city field, so agency city is matched via the user's
        // own location / cached.primaryCity (which we also surface in the card).
        if (city) {
            const cityList = String(city).split(',').map((s) => s.trim()).filter(Boolean);
            if (cityList.length) {
                const cityOr: any[] = [];
                for (const c of cityList) {
                    const rx = new RegExp(c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
                    cityOr.push({ location: rx }, { 'cached.primaryCity': rx });
                }
                pipeline.push({ $match: { $or: cityOr } });
            }
        }

        // Free-text q — OR over name / headline / artistType + the agency's org name.
        if (q) {
            const rx = new RegExp(String(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
            pipeline.push({
                $match: {
                    $or: [
                        { displayName: rx },
                        { headline: rx },
                        { artistType: rx },
                        { 'org.organizationName': rx },
                    ],
                },
            });
        }

        // Has portfolio media — OR over the three media signals.
        if (hasMedia === '1' || hasMedia === 'true') {
            pipeline.push({
                $match: {
                    $or: [
                        { hasPhotos: true },
                        { 'galleryUrls.0': { $exists: true } },
                        { 'videoUrls.0': { $exists: true } },
                    ],
                },
            });
        }

        // Sort. experienceLevel enum is alphabetical == skill order, so -1 = most experienced first.
        let sortSpec: any = { 'cached.featured': -1, updatedAt: -1 }; // relevance (default)
        if (sort === 'trust') sortSpec = { trustScore: -1, updatedAt: -1 };
        else if (sort === 'experience') sortSpec = { experienceLevel: -1, updatedAt: -1 };

        const limit = Math.min(Math.max(parseInt(pageSize, 10) || 20, 1), 50);
        const pageNum = Math.max(parseInt(page, 10) || 1, 1);

        // $facet: page rows + full filtered count in one round trip.
        pipeline.push({
            $facet: {
                rows: [
                    { $sort: sortSpec },
                    { $skip: (pageNum - 1) * limit },
                    { $limit: limit },
                    {
                        $project: {
                            // public fields only — never project filter-only fields
                            // (hasPhotos, galleryUrls, videoUrls, experienceLevel,
                            //  gender, trustScore).
                            displayName: 1,
                            profileImageUrl: 1,
                            role: 1,
                            kind: 1,
                            artistType: 1,
                            headline: 1,
                            location: 1,
                            'cached.primaryCity': 1,
                            trustTier: 1,
                            'org.organizationName': 1,
                            'org.logoUrl': 1,
                            'org.services': 1,
                        },
                    },
                ],
                count: [{ $count: 'n' }],
            },
        });

        const agg = await User.aggregate(pipeline);
        const facet = (agg && agg[0]) || { rows: [], count: [] };
        const docs: any[] = facet.rows || [];
        const total: number = facet.count?.[0]?.n || 0;

        const people = docs.map((u) => {
            if (u.kind === 'agency') {
                const org = u.org || {};
                return {
                    _id: String(u._id),
                    displayName: org.organizationName || u.displayName || 'NETSA member',
                    profileImageUrl: org.logoUrl || u.profileImageUrl,
                    role: u.role, // raw 'client'
                    kind: 'agency',
                    artType: undefined,
                    headline: u.headline,
                    city: u.cached?.primaryCity || u.location,
                    trustTier: u.trustTier,
                    services: org.services || [],
                };
            }
            return {
                _id: String(u._id),
                displayName: u.displayName || 'NETSA member',
                profileImageUrl: u.profileImageUrl,
                role: u.role,
                kind: u.kind,
                artType: Array.isArray(u.artistType) ? u.artistType[0] : u.artistType,
                headline: u.headline,
                city: u.cached?.primaryCity || u.location,
                trustTier: u.trustTier,
            };
        });

        res.json({ meta: { status: 200, message: 'OK' }, data: { people, page: pageNum, pageSize: limit, total }, errors: [] });
    } catch (err: any) {
        console.error('[Directory] error:', err.message);
        res.status(500).json({ meta: { status: 500, message: 'Server error' }, data: null, errors: [] });
    }
};
