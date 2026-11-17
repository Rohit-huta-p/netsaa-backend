import mongoose from 'mongoose';
import Organizer from '../models/Organizer';

/**
 * Resolves an organizer's brand / organization name from the shared `organizers`
 * collection (read-only mirror). The name lives on the Organizer doc, NOT on the
 * User doc and NOT in the JWT — so controllers can't read it off req.user.
 *
 * Returns `undefined` when there is no organizer doc or the name is unset, so
 * callers fall back to the poster's displayName instead of a sentinel like "TBD".
 * Never throws — a lookup failure must not block a post or 500 a detail read
 * (same best-effort contract as geocodeLocation).
 */
export async function organizationName(
    userId: string | mongoose.Types.ObjectId
): Promise<string | undefined> {
    try {
        const org = await Organizer.findOne({ userId })
            .select('organizationName')
            .lean();
        const name = (org as any)?.organizationName?.trim();
        return name || undefined;
    } catch {
        return undefined;
    }
}
