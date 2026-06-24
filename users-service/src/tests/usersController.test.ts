import request from 'supertest';

// ── Mongoose model mocks (match directory.test.ts harness style) ──
const mockFindById = jest.fn();
const mockOrganizerFindOne = jest.fn();
const mockArtistFindOne = jest.fn();

jest.mock('../models/User', () => ({
    __esModule: true,
    default: { findById: (...a: any[]) => mockFindById(...a) },
}));
// Preserve the real named exports (ORGANIZER_TYPE_CATEGORIES etc. are consumed by
// register.dto via the app import chain); only override the default model methods.
jest.mock('../models/Organizer', () => ({
    ...jest.requireActual('../models/Organizer'),
    __esModule: true,
    default: { findOne: (...a: any[]) => mockOrganizerFindOne(...a) },
}));
jest.mock('../models/Artist', () => ({
    ...jest.requireActual('../models/Artist'),
    __esModule: true,
    default: { findOne: (...a: any[]) => mockArtistFindOne(...a) },
}));

process.env.JWT_SECRET = 'test-secret';
import app from '../app';

// User.findById(id).select(...) → resolves to a doc exposing toObject().
const findByIdChain = (doc: any) => ({
    select: jest.fn(() => Promise.resolve(doc)),
});

// A User doc as returned by findById: has a `role` + a toObject() that yields
// the full plain object (incl. the secrets a real public fetch must strip).
const userDoc = (role: string, plain: Record<string, any>) => ({
    role,
    toObject: () => ({ role, ...plain }),
});

const VALID_ID = '507f1f77bcf86cd799439011';

describe('GET /api/users/:id', () => {
    beforeEach(() => {
        mockFindById.mockReset();
        mockOrganizerFindOne.mockReset();
        mockArtistFindOne.mockReset();
        mockOrganizerFindOne.mockResolvedValue(null);
        mockArtistFindOne.mockResolvedValue(null);
    });

    it('400s on a malformed id', async () => {
        const res = await request(app).get('/api/users/not-an-id');
        expect(res.status).toBe(400);
        expect(mockFindById).not.toHaveBeenCalled();
    });

    it('404s when the user is missing', async () => {
        mockFindById.mockReturnValue(findByIdChain(null));
        const res = await request(app).get(`/api/users/${VALID_ID}`);
        expect(res.status).toBe(404);
    });

    // ── Client tiered public profile ──

    it('individual client → lean public DTO, NO email / phone / showcase', async () => {
        mockFindById.mockReturnValue(findByIdChain(userDoc('client', {
            _id: VALID_ID,
            displayName: 'Rahul Mehta',
            email: 'rahul@private.com',
            phoneNumber: '+919876543210',
            profileImageUrl: 'http://x/p.jpg',
            location: 'Pune',
            cached: { primaryCity: 'Pune' },
            phoneVerifiedAt: new Date('2026-01-01T00:00:00Z'),
            createdAt: new Date('2026-01-01T00:00:00Z'),
            otp: '999999',
            otpExpires: new Date(),
        })));
        mockOrganizerFindOne.mockResolvedValue({
            organizationName: 'Mehta Films',
            organizerTypeCategory: 'individual',
            // showcase fields exist on the doc but MUST NOT surface for non-agency
            bio: 'should not leak',
            services: ['leak'],
            photos: ['http://x/leak.jpg'],
            logoUrl: 'http://x/leak-logo.jpg',
            billingDetails: { gstNumber: 'GST-LEAK' },
        });

        const res = await request(app).get(`/api/users/${VALID_ID}`);
        expect(res.status).toBe(200);

        // Lean base set present
        expect(res.body).toEqual(expect.objectContaining({
            _id: VALID_ID,
            displayName: 'Rahul Mehta',
            role: 'client',
            profileImageUrl: 'http://x/p.jpg',
            city: 'Pune',
            verified: true,
            organizationName: 'Mehta Films',
            organizerTypeCategory: 'individual',
        }));
        expect(res.body.joined).toBeTruthy();

        // PRIVACY: never leak contact / billing / otp / showcase for individual
        for (const leaky of [
            'email', 'phoneNumber', 'billingDetails', 'otp', 'otpExpires',
            'bio', 'services', 'photos', 'yearsInBusiness', 'teamSize',
            'logoUrl', 'organizationWebsite', 'cached', 'location', 'passwordHash',
        ]) {
            expect(res.body).not.toHaveProperty(leaky);
        }
    });

    it('city falls back to location when cached.primaryCity is absent; verified=false without phoneVerifiedAt', async () => {
        mockFindById.mockReturnValue(findByIdChain(userDoc('client', {
            _id: VALID_ID,
            displayName: 'No City Cache',
            location: 'Mumbai',
            createdAt: new Date(),
        })));
        mockOrganizerFindOne.mockResolvedValue(null); // lean tier needs no Organizer doc

        const res = await request(app).get(`/api/users/${VALID_ID}`);
        expect(res.status).toBe(200);
        expect(res.body.city).toBe('Mumbai');
        expect(res.body.verified).toBe(false);
        expect(res.body.organizationName).toBeUndefined();
        expect(res.body.organizerTypeCategory).toBeUndefined();
        expect(res.body).not.toHaveProperty('email');
        expect(res.body).not.toHaveProperty('phoneNumber');
    });

    it('agency client → ALSO returns showcase fields, still NO email / phone / billing', async () => {
        mockFindById.mockReturnValue(findByIdChain(userDoc('client', {
            _id: VALID_ID,
            displayName: 'Anjali Events',
            email: 'anjali@private.com',
            phoneNumber: '+919812345678',
            profileImageUrl: 'http://x/a.jpg',
            cached: { primaryCity: 'Pune' },
            phoneVerifiedAt: new Date(),
            createdAt: new Date(),
        })));
        mockOrganizerFindOne.mockResolvedValue({
            organizationName: 'Anjali Events Co',
            organizerTypeCategory: 'agency',
            logoUrl: 'http://x/logo.jpg',
            organizationWebsite: 'https://anjali.example',
            bio: 'Full-service events agency.',
            services: ['Live Music', 'Decor'],
            photos: ['http://x/1.jpg', 'http://x/2.jpg'],
            yearsInBusiness: 8,
            teamSize: 25,
            billingDetails: { gstNumber: 'GST-SECRET', legalBusinessName: 'Anjali Pvt Ltd' },
        });

        const res = await request(app).get(`/api/users/${VALID_ID}`);
        expect(res.status).toBe(200);

        // Showcase set present
        expect(res.body).toEqual(expect.objectContaining({
            role: 'client',
            organizerTypeCategory: 'agency',
            logoUrl: 'http://x/logo.jpg',
            organizationWebsite: 'https://anjali.example',
            bio: 'Full-service events agency.',
            services: ['Live Music', 'Decor'],
            photos: ['http://x/1.jpg', 'http://x/2.jpg'],
            yearsInBusiness: 8,
            teamSize: 25,
        }));

        // PRIVACY: contact + billing still stripped on the rich tier
        for (const leaky of ['email', 'phoneNumber', 'billingDetails', 'otp', 'otpExpires', 'passwordHash']) {
            expect(res.body).not.toHaveProperty(leaky);
        }
    });

    // ── Artist / creative_lead unchanged ──

    it('artist fetch → unchanged: full user + artistDetails, no client DTO', async () => {
        const artistDoc = { _id: VALID_ID, headline: 'Contemporary dancer' };
        mockFindById.mockReturnValue(findByIdChain(userDoc('artist', {
            _id: VALID_ID,
            displayName: 'Ravi Kumar',
            email: 'ravi@x.com',
            skills: ['dance'],
            createdAt: new Date(),
        })));
        mockArtistFindOne.mockResolvedValue(artistDoc);

        const res = await request(app).get(`/api/users/${VALID_ID}`);
        expect(res.status).toBe(200);
        // existing behaviour: raw user fields present (incl. email), artistDetails attached
        expect(res.body.displayName).toBe('Ravi Kumar');
        expect(res.body.email).toBe('ravi@x.com');
        expect(res.body.artistDetails).toEqual(expect.objectContaining({ headline: 'Contemporary dancer' }));
        expect(mockArtistFindOne).toHaveBeenCalled();
        // no client-DTO shape markers
        expect(res.body).not.toHaveProperty('joined');
        expect(res.body).not.toHaveProperty('verified');
    });

    it('creative_lead fetch → unchanged: full user + organizerDetails + artistDetails', async () => {
        const orgDoc = { organizationName: 'Lead Co', organizerTypeCategory: 'agency', bio: 'kept' };
        const artistDoc = { headline: 'CL headline' };
        mockFindById.mockReturnValue(findByIdChain(userDoc('creative_lead', {
            _id: VALID_ID,
            displayName: 'CL Person',
            email: 'cl@x.com',
            createdAt: new Date(),
        })));
        mockOrganizerFindOne.mockResolvedValue(orgDoc);
        mockArtistFindOne.mockResolvedValue(artistDoc);

        const res = await request(app).get(`/api/users/${VALID_ID}`);
        expect(res.status).toBe(200);
        // creative_lead keeps the raw merged object (NOT the stripped client DTO)
        expect(res.body.email).toBe('cl@x.com');
        expect(res.body.organizerDetails).toEqual(expect.objectContaining({ organizationName: 'Lead Co' }));
        expect(res.body.artistDetails).toEqual(expect.objectContaining({ headline: 'CL headline' }));
        expect(res.body).not.toHaveProperty('joined');
    });
});
