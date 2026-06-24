import { updateOrganizerSchema, containsForbiddenKeys } from '../validators/organizer.dto';

describe('updateOrganizerSchema — Part D showcase fields', () => {
    it('accepts the new showcase fields', () => {
        const parsed = updateOrganizerSchema.safeParse({
            bio: 'Full-service events agency.',
            services: ['Live Music', 'Decor'],
            photos: ['https://x/1.jpg', 'https://x/2.jpg'],
            yearsInBusiness: 8,
            teamSize: 25,
            organizationWebsite: 'https://anjali.example',
            logoUrl: 'https://x/logo.jpg',
        });
        expect(parsed.success).toBe(true);
        if (parsed.success) {
            expect(parsed.data.bio).toBe('Full-service events agency.');
            expect(parsed.data.services).toEqual(['Live Music', 'Decor']);
            expect(parsed.data.photos).toHaveLength(2);
            expect(parsed.data.yearsInBusiness).toBe(8);
            expect(parsed.data.teamSize).toBe(25);
        }
    });

    it('enforces showcase bounds (photos must be URLs, teamSize >= 1, yearsInBusiness <= 100)', () => {
        expect(updateOrganizerSchema.safeParse({ photos: ['not-a-url'] }).success).toBe(false);
        expect(updateOrganizerSchema.safeParse({ teamSize: 0 }).success).toBe(false);
        expect(updateOrganizerSchema.safeParse({ yearsInBusiness: 101 }).success).toBe(false);
        expect(updateOrganizerSchema.safeParse({ services: new Array(21).fill('x') }).success).toBe(false);
    });

    it('still rejects forbidden keys (verification / organizerStats)', () => {
        expect(containsForbiddenKeys({ bio: 'ok', verification: { businessVerified: true } }))
            .toContain('verification');
        expect(containsForbiddenKeys({ organizerStats: { gigsPosted: 99 } }))
            .toContain('organizerStats');
        // a body of only showcase fields is clean
        expect(containsForbiddenKeys({ bio: 'ok', services: ['x'], teamSize: 3 })).toEqual([]);
    });

    it('strict() rejects an unknown key alongside valid showcase fields', () => {
        const parsed = updateOrganizerSchema.safeParse({ bio: 'ok', notAField: true });
        expect(parsed.success).toBe(false);
    });
});
