import Organizer from '../models/Organizer';

/** Looks up the org category for a user (shared DB). Returns undefined if none. */
export async function organizerCategory(userId: string): Promise<string | undefined> {
    const org = await Organizer.findOne({ userId }).select('organizerTypeCategory').lean();
    return (org as any)?.organizerTypeCategory;
}
