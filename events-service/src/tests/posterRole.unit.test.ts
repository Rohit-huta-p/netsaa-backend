import { isCreativeLeadRole } from '../utils/posterRole';

// Gate for the follower fan-out: only Creative-Lead-hosted events notify.
describe('isCreativeLeadRole (follower-notification gate)', () => {
    it('true for creative_lead and the legacy organizer role', () => {
        expect(isCreativeLeadRole('creative_lead')).toBe(true);
        expect(isCreativeLeadRole('organizer')).toBe(true);
    });

    it('false for client, artist, admin, and missing role', () => {
        expect(isCreativeLeadRole('client')).toBe(false);
        expect(isCreativeLeadRole('artist')).toBe(false);
        expect(isCreativeLeadRole('admin')).toBe(false);
        expect(isCreativeLeadRole(undefined)).toBe(false);
        expect(isCreativeLeadRole('')).toBe(false);
    });
});
