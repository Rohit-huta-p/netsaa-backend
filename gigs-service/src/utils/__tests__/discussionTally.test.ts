// Pure-function tests for the gig discussion tally — no DB, no mocks. Keeps the
// "waiting" count identical to the client's DiscussionThreadView.buildThreads.

import { tallyGigDiscussions } from '../discussionTally';

describe('tallyGigDiscussions', () => {
    it('counts waiting = unanswered non-owner roots (ported from DiscussionThreadView.owner.test)', () => {
        // q1 (a1) unanswered · q2 (a2) answered by the owner's reply r2 · q3 (out1) unanswered
        const comments = [
            { _id: 'q1', topicId: 'g1', authorId: 'a1' },
            { _id: 'q2', topicId: 'g1', authorId: 'a2' },
            { _id: 'r2', topicId: 'g1', authorId: 'prod1', parentId: 'q2' },
            { _id: 'q3', topicId: 'g1', authorId: 'out1' },
        ];
        expect(tallyGigDiscussions(comments, 'prod1').get('g1')).toEqual({
            discussionCount: 4,
            waitingCount: 2,
        });
    });

    it("does not count the owner's own root question as waiting", () => {
        const comments = [
            { _id: 'o1', topicId: 'g1', authorId: 'prod1' }, // owner's own post
            { _id: 'a1', topicId: 'g1', authorId: 'x1' }, // someone else → waiting
        ];
        expect(tallyGigDiscussions(comments, 'prod1').get('g1')).toEqual({
            discussionCount: 2,
            waitingCount: 1,
        });
    });

    it('compares ObjectId-like ids as strings (the silent-mismatch bug)', () => {
        const oid = (s: string) => ({ toString: () => s });
        const comments = [
            { _id: oid('q1'), topicId: oid('gA'), authorId: oid('u1') }, // non-owner root → waiting
            { _id: oid('q2'), topicId: oid('gB'), authorId: oid('owner') }, // owner root → not waiting
        ];
        const t = tallyGigDiscussions(comments, oid('owner'));
        expect(t.get('gA')).toEqual({ discussionCount: 1, waitingCount: 1 });
        expect(t.get('gB')).toEqual({ discussionCount: 1, waitingCount: 0 });
    });

    it('separates counts per gig', () => {
        const comments = [
            { _id: 'q1', topicId: 'g1', authorId: 'a1' },
            { _id: 'q2', topicId: 'g2', authorId: 'a2' },
            { _id: 'r1', topicId: 'g2', authorId: 'prod1', parentId: 'q2' }, // g2 answered
        ];
        const t = tallyGigDiscussions(comments, 'prod1');
        expect(t.get('g1')).toEqual({ discussionCount: 1, waitingCount: 1 });
        expect(t.get('g2')).toEqual({ discussionCount: 2, waitingCount: 0 });
    });

    it('returns an empty map for no comments', () => {
        expect(tallyGigDiscussions([], 'prod1').size).toBe(0);
    });
});
