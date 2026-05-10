import EventTag from '../models/EventTag';
import { normalizeTag, isValidTagId } from './tagNormalization.service';

const PROFANITY_RE = /\b(fuck|shit|cunt|bitch|asshole|bastard|nigger|chutiya|bhenchod|madarchod|saalaa|harami)\b/i;
//                   tighten this in production based on moderation experience

export interface SubmitTagResult {
    created: boolean;
    normalizedId: string;
    displayName: string;
}

export async function submitTag(rawInput: string, userId: string): Promise<SubmitTagResult> {
    const normalized = normalizeTag(rawInput);

    if (!isValidTagId(normalized)) {
        throw new Error('INVALID_TAG_ID');
    }
    if (PROFANITY_RE.test(normalized) || PROFANITY_RE.test(rawInput)) {
        throw new Error('PROFANITY_BLOCKED');
    }

    const existing = await EventTag.findById(normalized);
    if (existing) {
        return {
            created: false,
            normalizedId: normalized,
            displayName: (existing as any).displayName,
        };
    }

    const displayName = toTitleCase(rawInput.trim().slice(0, 60));

    await EventTag.create({
        _id: normalized,
        displayName,
        status: 'pending',
        usageCount: 0,
        createdBy: userId,
    });

    return { created: true, normalizedId: normalized, displayName };
}

export async function approveTag(tagId: string, adminId: string): Promise<void> {
    await EventTag.findByIdAndUpdate(tagId, {
        status: 'approved',
        approvedAt: new Date(),
        approvedBy: adminId,
    });
}

export async function blockTag(tagId: string, adminId: string): Promise<void> {
    await EventTag.findByIdAndUpdate(tagId, {
        status: 'blocked',
        approvedAt: new Date(),
        approvedBy: adminId,
    });
}

/**
 * Called from event publish flow. Increments usageCount on every tag the event
 * uses. After 5+ approved uses, a 'pending' tag auto-graduates to 'approved'
 * (so it shows in autocomplete suggestions).
 */
export async function incrementTagUsage(tagIds: string[]): Promise<void> {
    await Promise.all(tagIds.map(async (id) => {
        const updated = await EventTag.findByIdAndUpdate(
            id,
            { $inc: { usageCount: 1 } },
            { new: true }
        );

        if (updated && (updated as any).status === 'pending' && (updated as any).usageCount >= 5) {
            await EventTag.findByIdAndUpdate(id, {
                status: 'approved',
                approvedAt: new Date(),
                approvedBy: 'system',
            });
        }
    }));
}

export async function listPendingTags(limit = 50) {
    return EventTag.find({ status: 'pending' })
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean();
}

export async function listSuggestionTags(limit = 20) {
    return EventTag.find({ status: { $in: ['seed', 'approved'] } })
        .sort({ usageCount: -1 })
        .limit(limit)
        .lean();
}

function toTitleCase(s: string): string {
    return s.replace(/\w\S*/g, (t) => t.charAt(0).toUpperCase() + t.substr(1).toLowerCase());
}
