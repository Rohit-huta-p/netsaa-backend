// Unit tests for the B1 applicant-snapshot extras helper (pure, no mongoose).
import { artistSnapshotExtras } from '../artistSnapshot';

describe('artistSnapshotExtras', () => {
    it('takes cached.primaryCity and the top 3 skills', () => {
        const out = artistSnapshotExtras({
            cached: { primaryCity: 'Pune' },
            skills: ['Kathak', 'Contemporary', 'Bollywood', 'Folk', 'Hip-hop'],
        });
        expect(out).toEqual({ primaryCity: 'Pune', specialities: ['Kathak', 'Contemporary', 'Bollywood'] });
    });

    it('keeps all skills when there are 3 or fewer', () => {
        expect(artistSnapshotExtras({ skills: ['Kathak', 'Folk'] }).specialities).toEqual(['Kathak', 'Folk']);
    });

    it('prefers the mirror city over the JWT fallback', () => {
        const out = artistSnapshotExtras({ cached: { primaryCity: 'Pune' } }, 'Mumbai');
        expect(out.primaryCity).toBe('Pune');
    });

    it('falls back to the JWT city when the mirror has none', () => {
        expect(artistSnapshotExtras({ skills: [] }, 'Mumbai').primaryCity).toBe('Mumbai');
    });

    it('omits specialities entirely when there are no skills', () => {
        const out = artistSnapshotExtras({ cached: { primaryCity: 'Pune' }, skills: [] });
        expect(out).toEqual({ primaryCity: 'Pune' });
        expect('specialities' in out).toBe(false);
    });

    it('omits primaryCity when neither the mirror nor the fallback has one', () => {
        const out = artistSnapshotExtras({ skills: ['Kathak'] });
        expect(out).toEqual({ specialities: ['Kathak'] });
        expect('primaryCity' in out).toBe(false);
    });

    it('returns an empty object for a null user with no fallback', () => {
        expect(artistSnapshotExtras(null)).toEqual({});
        expect(artistSnapshotExtras(undefined)).toEqual({});
    });

    it('never overwrites with undefined (sparse result, safe to spread)', () => {
        // Spreading an empty result onto an existing snapshot must be a no-op.
        const base = { primaryCity: 'Delhi', specialities: ['Jazz'] };
        expect({ ...base, ...artistSnapshotExtras(null) }).toEqual(base);
    });
});
