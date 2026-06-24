import {
    normalizeRole,
    visiblePosterRolesFor,
    canApply,
    canPost,
    posterRoleFor,
} from '../roleVisibility';

describe('normalizeRole', () => {
    it('maps legacy organizer tokens to creative_lead', () => {
        expect(normalizeRole('organizer')).toBe('creative_lead');
    });
    it('passes through new roles', () => {
        expect(normalizeRole('client')).toBe('client');
        expect(normalizeRole('creative_lead')).toBe('creative_lead');
        expect(normalizeRole('artist')).toBe('artist');
        expect(normalizeRole('admin')).toBe('admin');
    });
    it('defaults missing/unknown to artist', () => {
        expect(normalizeRole(undefined)).toBe('artist');
        expect(normalizeRole('weird')).toBe('artist');
    });
});

describe('visiblePosterRolesFor (the wall)', () => {
    it('artist sees creative_lead posts', () => {
        expect(visiblePosterRolesFor('artist')).toEqual(['creative_lead']);
    });
    it('creative_lead sees client posts', () => {
        expect(visiblePosterRolesFor('creative_lead')).toEqual(['client']);
    });
    it('client sees no one (own-posts handled by caller)', () => {
        expect(visiblePosterRolesFor('client')).toEqual([]);
    });
    it('admin sees all', () => {
        expect(visiblePosterRolesFor('admin')).toBeNull();
    });
});

describe('canApply', () => {
    it('artist can apply to creative_lead posts only', () => {
        expect(canApply('artist', 'creative_lead')).toBe(true);
        expect(canApply('artist', 'client')).toBe(false);
    });
    it('creative_lead can apply to client posts only', () => {
        expect(canApply('creative_lead', 'client')).toBe(true);
        expect(canApply('creative_lead', 'creative_lead')).toBe(false);
    });
    it('client cannot apply at all', () => {
        expect(canApply('client', 'client')).toBe(false);
        expect(canApply('client', 'creative_lead')).toBe(false);
    });
    it('legacy unstamped gigs count as creative_lead posts', () => {
        expect(canApply('artist', undefined)).toBe(true);
        expect(canApply('creative_lead', undefined)).toBe(false);
    });
});

describe('canPost / posterRoleFor', () => {
    it('client and creative_lead can post, artist cannot', () => {
        expect(canPost('client')).toBe(true);
        expect(canPost('creative_lead')).toBe(true);
        expect(canPost('artist')).toBe(false);
        expect(canPost('admin')).toBe(true);
    });
    it('stamps posterRole from creator role', () => {
        expect(posterRoleFor('client')).toBe('client');
        expect(posterRoleFor('creative_lead')).toBe('creative_lead');
        expect(posterRoleFor('admin')).toBe('creative_lead');
    });
});
