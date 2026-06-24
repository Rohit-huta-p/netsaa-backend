/**
 * Three-role marketplace wall (2026-06):
 *   client posts        -> visible/appliable only by creative_lead
 *   creative_lead posts -> visible/appliable only by artist
 * Events are NOT walled — this module is for gigs only.
 */
export type MarketRole = 'client' | 'creative_lead' | 'artist' | 'admin';
export type PosterRole = 'client' | 'creative_lead';

/** Legacy JWTs carry 'organizer' (pre-2026-06 virtual role); map forward. */
export const normalizeRole = (raw?: string): MarketRole => {
    if (raw === 'organizer') return 'creative_lead';
    if (raw === 'client' || raw === 'creative_lead' || raw === 'artist' || raw === 'admin') return raw;
    return 'artist';
};

/** Poster roles a viewer's feed shows. null = no restriction (admin). */
export const visiblePosterRolesFor = (viewer: MarketRole): PosterRole[] | null => {
    if (viewer === 'admin') return null;
    if (viewer === 'artist') return ['creative_lead'];
    if (viewer === 'creative_lead') return ['client'];
    return []; // client: feed is own posts only — caller filters by organizerId
};

/** Gigs created before the migration lack posterRole; they are creative_lead posts. */
export const canApply = (viewer: MarketRole, posterRole?: string): boolean => {
    const effective: PosterRole = posterRole === 'client' ? 'client' : 'creative_lead';
    if (viewer === 'artist') return effective === 'creative_lead';
    if (viewer === 'creative_lead') return effective === 'client';
    return false;
};

export const canPost = (viewer: MarketRole): boolean => viewer !== 'artist';

export const posterRoleFor = (viewer: MarketRole): PosterRole =>
    viewer === 'client' ? 'client' : 'creative_lead';

/** An agency-flagged client may act as a supplier (browse/propose on client posts). */
export const isAgencySupplier = (viewer: MarketRole, organizerTypeCategory?: string): boolean =>
    viewer === 'client' && organizerTypeCategory === 'agency';
