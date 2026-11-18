// Tally a flat gig-comment list into { discussionCount, waitingCount } per gig.
//
// This mirrors the client's DiscussionThreadView.buildThreads EXACTLY so the
// "Your work" card and the gig discussion page can never disagree:
//   • discussionCount — total comments on the gig (roots + replies). Computed over
//     the SAME set the discussion list returns (getGigDiscussion applies no isDeleted
//     filter), so a soft-deleted/masked comment still counts, as the gig page shows it.
//   • waitingCount — root questions the owner still owes a reply on: a root NOT authored
//     by the owner, with no reply authored by the owner. A "root" is a top-level comment
//     (no parentId) OR a reply whose parent isn't present (orphaned) — same as the client.
//
// Ids are ObjectIds in Mongo and strings on the client, so every comparison is done on
// String(id) (a raw === on an ObjectId vs a string silently never matches).

export interface TallyComment {
    _id: unknown;
    topicId: unknown;
    authorId: unknown;
    parentId?: unknown;
}

export interface DiscussionCounts {
    discussionCount: number;
    waitingCount: number;
}

const sid = (v: unknown): string => (v == null ? '' : String(v));

/**
 * Group comments (possibly spanning many gigs) by topicId and compute counts per gig.
 * `ownerId` is the single gig owner — the dashboard lists one organizer's gigs, so every
 * gig in `comments` shares the same owner.
 */
export function tallyGigDiscussions(
    comments: TallyComment[],
    ownerId: unknown,
): Map<string, DiscussionCounts> {
    const owner = sid(ownerId);

    const byTopic = new Map<string, TallyComment[]>();
    for (const c of comments) {
        const t = sid(c.topicId);
        const arr = byTopic.get(t);
        if (arr) arr.push(c);
        else byTopic.set(t, [c]);
    }

    const out = new Map<string, DiscussionCounts>();
    for (const [topic, list] of byTopic) {
        const ids = new Set(list.map((c) => sid(c._id)));

        // Root = top-level comment, or an orphan whose parent isn't in this gig's set.
        const isRoot = (c: TallyComment): boolean => {
            const p = sid(c.parentId);
            return p === '' || !ids.has(p);
        };

        // Root ids the owner has already replied to (owner replies point at the root).
        const ownerAnswered = new Set<string>();
        for (const c of list) {
            if (!isRoot(c) && sid(c.authorId) === owner) ownerAnswered.add(sid(c.parentId));
        }

        let waiting = 0;
        for (const c of list) {
            if (!isRoot(c)) continue;
            const byOwner = sid(c.authorId) === owner;
            if (!byOwner && !ownerAnswered.has(sid(c._id))) waiting++;
        }

        out.set(topic, { discussionCount: list.length, waitingCount: waiting });
    }
    return out;
}
