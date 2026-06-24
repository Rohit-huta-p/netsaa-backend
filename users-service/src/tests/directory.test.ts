import request from 'supertest';

// Controller now uses User.aggregate([...]) returning a single $facet doc:
//   [{ rows: [...mapped-shape...], count: [{ n }] }]
const mockAggregate = jest.fn();
jest.mock('../models/User', () => ({
    __esModule: true,
    default: {
        aggregate: (...a: any[]) => mockAggregate(...a),
    },
}));
// Valid 24-hex ObjectId so the controller's self-exclusion ($ne on _id) is exercised.
const SELF_ID = '5f9d88b9c1f4a83d3c0a0001';
// Mutable so individual tests can flip the viewer's market role (must be
// `mock`-prefixed for jest to allow the reference inside the hoisted factory).
let mockViewerRole = 'client';
jest.mock('../middleware/auth', () => ({
    protect: (req: any, _res: any, next: any) => { req.user = { _id: '5f9d88b9c1f4a83d3c0a0001', id: '5f9d88b9c1f4a83d3c0a0001', role: mockViewerRole }; next(); },
}));
jest.mock('../config/db', () => jest.fn());

process.env.JWT_SECRET = 'test-secret';
import app from '../app';

// Build a $facet result. `rows` are already in the projected shape the
// controller maps (they carry `kind`, `org`, `cached`, etc.).
const facet = (rows: any[], total?: number) =>
    Promise.resolve([{ rows, count: total != null ? [{ n: total }] : (rows.length ? [{ n: rows.length }] : []) }]);

// Flatten the pipeline so we can search for a stage matching a predicate,
// regardless of which index it lands at.
const stages = () => (mockAggregate.mock.calls[0][0] as any[]);
const findStage = (pred: (s: any) => boolean) => stages().find(pred);

describe('GET /api/users/directory', () => {
    beforeEach(() => { mockAggregate.mockReset(); mockAggregate.mockReturnValue(facet([])); mockViewerRole = 'client'; });

    // 1. Default (no role) surfaces artist + creative_lead + agency kinds.
    it('default (no role) includes artist, creative_lead AND agency kinds', async () => {
        mockAggregate.mockReturnValue(facet([
            { _id: 'a1', displayName: 'Ravi', role: 'artist', kind: 'artist', artistType: ['Dancer'], cached: { primaryCity: 'Pune' } },
            { _id: 'c1', displayName: 'Mira', role: 'creative_lead', kind: 'creative_lead', cached: { primaryCity: 'Pune' } },
            { _id: 'g1', displayName: 'Acme owner', role: 'client', kind: 'agency', org: { organizationName: 'Acme Events', services: ['Catering'] } },
        ], 3));
        const res = await request(app).get('/api/users/directory');
        expect(res.status).toBe(200);
        const kinds = res.body.data.people.map((p: any) => p.kind);
        expect(kinds).toEqual(expect.arrayContaining(['artist', 'creative_lead', 'agency']));
        // No role-narrowing $match { kind: <single> } when role is absent.
        const roleNarrow = stages().filter(
            (s: any) => s.$match && typeof s.$match.kind === 'string',
        );
        expect(roleNarrow).toHaveLength(0);
    });

    // 1b. A creative_lead viewer never sees agencies — viewer-scoped wall, even
    //     with no role param. (CLs are new directory consumers via the Talent tab.)
    it('creative_lead viewer excludes agency kind from the visible set', async () => {
        mockViewerRole = 'creative_lead';
        mockAggregate.mockReturnValue(facet([
            { _id: 'a1', displayName: 'Ravi', role: 'artist', kind: 'artist' },
            { _id: 'c1', displayName: 'Mira', role: 'creative_lead', kind: 'creative_lead' },
        ], 2));
        const res = await request(app).get('/api/users/directory');
        expect(res.status).toBe(200);
        // The privacy-guard $match limits `kind` to artist + creative_lead only.
        const guard = findStage(
            (s: any) => s.$match && s.$match.kind && Array.isArray(s.$match.kind.$in),
        );
        expect(guard).toBeDefined();
        expect(guard.$match.kind.$in).toEqual(['artist', 'creative_lead']);
        expect(guard.$match.kind.$in).not.toContain('agency');
    });

    // 2. role=agency → only agency kind.
    it('role=agency narrows to kind === agency only', async () => {
        mockAggregate.mockReturnValue(facet([
            { _id: 'g1', displayName: 'owner', role: 'client', kind: 'agency', org: { organizationName: 'Acme Events', logoUrl: 'http://x/l.png', services: ['DJ'] } },
        ], 1));
        const res = await request(app).get('/api/users/directory?role=agency');
        expect(res.status).toBe(200);
        // Pipeline narrows on kind.
        expect(findStage((s) => s.$match && s.$match.kind === 'agency')).toBeDefined();
        expect(res.body.data.people.every((p: any) => p.kind === 'agency')).toBe(true);
    });

    // 3. role=artist → only artist kind.
    it('role=artist narrows to kind === artist only', async () => {
        mockAggregate.mockReturnValue(facet([
            { _id: 'a1', displayName: 'Ravi', role: 'artist', kind: 'artist', artistType: ['Dancer'] },
        ], 1));
        const res = await request(app).get('/api/users/directory?role=artist');
        expect(res.status).toBe(200);
        expect(findStage((s) => s.$match && s.$match.kind === 'artist')).toBeDefined();
        expect(res.body.data.people.every((p: any) => p.kind === 'artist')).toBe(true);
    });

    it('role=creative_lead narrows to kind === creative_lead only', async () => {
        mockAggregate.mockReturnValue(facet([
            { _id: 'c1', displayName: 'Mira', role: 'creative_lead', kind: 'creative_lead' },
        ], 1));
        const res = await request(app).get('/api/users/directory?role=creative_lead');
        expect(findStage((s) => s.$match && s.$match.kind === 'creative_lead')).toBeDefined();
        expect(res.body.data.people.every((p: any) => p.kind === 'creative_lead')).toBe(true);
    });

    it('unknown role adds no kind-narrowing stage (all three kinds)', async () => {
        mockAggregate.mockReturnValue(facet([]));
        await request(app).get('/api/users/directory?role=bogus');
        const roleNarrow = stages().filter((s: any) => s.$match && typeof s.$match.kind === 'string');
        expect(roleNarrow).toHaveLength(0);
    });

    // 4. PRIVACY: the pipeline must require agency category for clients and drop
    //    everything that collapses to kind === 'client' (individuals, no-org).
    it('privacy: pipeline labels agency only for client+agency-org and drops non-agency clients', async () => {
        await request(app).get('/api/users/directory');
        const p = stages();

        // (a) kind is derived with an explicit agency requirement for clients.
        const addKind = p.find((s: any) => s.$addFields && s.$addFields.kind);
        expect(addKind).toBeDefined();
        const cond = JSON.stringify(addKind.$addFields.kind);
        expect(cond).toContain('$role');
        expect(cond).toContain('client');
        expect(cond).toContain('organizerTypeCategory');
        expect(cond).toContain('agency');

        // (b) a membership $match keeps only the three valid kinds — so a client
        //     whose org is not an agency (kind stays 'client') is excluded.
        const member = p.find(
            (s: any) => s.$match && s.$match.kind && Array.isArray(s.$match.kind.$in),
        );
        expect(member).toBeDefined();
        expect(member.$match.kind.$in).toEqual(expect.arrayContaining(['artist', 'creative_lead', 'agency']));
        expect(member.$match.kind.$in).not.toContain('client');

        // (c) blocked users are excluded up front.
        const blockGuard = p.find((s: any) => s.$match && s.$match.blocked);
        expect(blockGuard).toBeDefined();
        expect(blockGuard.$match.blocked).toEqual({ $ne: true });
    });

    it('excludes the requesting user (own profile) from the directory', async () => {
        await request(app).get('/api/users/directory');
        // The viewer's own _id is excluded in the cheap pre-filter ($match with blocked).
        const pre = stages().find((s: any) => s.$match && s.$match.blocked);
        expect(pre).toBeDefined();
        expect(pre.$match._id).toBeDefined();
        expect(pre.$match._id.$ne).toBeDefined();
        expect(String(pre.$match._id.$ne)).toBe(SELF_ID);
    });

    it('privacy: an individual client fed as a row is never labeled agency', async () => {
        // Even if a stray client row reached mapping, it would carry kind:'client'
        // (the pipeline never sets agency for non-agency orgs) and must NOT be
        // mapped as an agency card. We assert the membership stage that filters it.
        await request(app).get('/api/users/directory');
        const member = stages().find(
            (s: any) => s.$match && s.$match.kind && Array.isArray(s.$match.kind.$in),
        );
        expect(member.$match.kind.$in).not.toContain('client');
    });

    // 5. Agency mapping: org name → displayName, logo → image, services, kind.
    it('agency row maps displayName/logo/services and kind=agency', async () => {
        mockAggregate.mockReturnValue(facet([
            {
                _id: 'g1',
                displayName: 'Personal Name',          // should be overridden by org name
                profileImageUrl: 'http://x/avatar.jpg', // should be overridden by logo
                role: 'client',
                kind: 'agency',
                headline: 'Premier events agency',
                cached: { primaryCity: 'Mumbai' },
                location: 'Mumbai',
                org: { organizationName: 'Acme Events', logoUrl: 'http://x/logo.png', services: ['Catering', 'DJ'] },
            },
        ], 1));
        const res = await request(app).get('/api/users/directory?role=agency');
        const card = res.body.data.people[0];
        expect(card).toEqual(expect.objectContaining({
            _id: 'g1',
            displayName: 'Acme Events',
            profileImageUrl: 'http://x/logo.png',
            role: 'client',
            kind: 'agency',
            city: 'Mumbai',
            services: ['Catering', 'DJ'],
        }));
        expect(card.artType).toBeUndefined();
    });

    it('agency row falls back to user fields when org name/logo missing', async () => {
        mockAggregate.mockReturnValue(facet([
            {
                _id: 'g2', displayName: 'Fallback Name', profileImageUrl: 'http://x/u.jpg',
                role: 'client', kind: 'agency', location: 'Pune',
                org: { organizerTypeCategory: 'agency' }, // no name/logo/services
            },
        ], 1));
        const res = await request(app).get('/api/users/directory?role=agency');
        const card = res.body.data.people[0];
        expect(card.displayName).toBe('Fallback Name');
        expect(card.profileImageUrl).toBe('http://x/u.jpg');
        expect(card.city).toBe('Pune');
        expect(card.services).toEqual([]);
    });

    // Artist/CL mapping unchanged (kind = role).
    it('artist row maps artType/city and kind=role', async () => {
        mockAggregate.mockReturnValue(facet([
            { _id: 'a1', displayName: 'Ravi', role: 'artist', kind: 'artist', profileImageUrl: 'http://x/p.jpg', artistType: ['Dancer'], headline: 'Contemporary dancer', cached: { primaryCity: 'Pune' } },
        ], 1));
        const res = await request(app).get('/api/users/directory');
        expect(res.body.data.people[0]).toEqual(expect.objectContaining({
            _id: 'a1', displayName: 'Ravi', role: 'artist', kind: 'artist',
            profileImageUrl: 'http://x/p.jpg', artType: 'Dancer', city: 'Pune',
        }));
    });

    it('displayName falls back to "NETSA member" for artists', async () => {
        mockAggregate.mockReturnValue(facet([
            { _id: 'a9', role: 'artist', kind: 'artist' },
        ], 1));
        const res = await request(app).get('/api/users/directory');
        expect(res.body.data.people[0].displayName).toBe('NETSA member');
    });

    // 6. Filter facets still build correctly (inspect pipeline stages).
    it('city (single) builds an OR over location / cached.primaryCity', async () => {
        await request(app).get('/api/users/directory?city=Pune');
        const cityStage = findStage((s) => s.$match && Array.isArray(s.$match.$or)
            && s.$match.$or.some((c: any) => c.location || c['cached.primaryCity']));
        expect(cityStage).toBeDefined();
        const fields = cityStage.$match.$or.map((c: any) => Object.keys(c)[0]);
        expect(fields).toEqual(expect.arrayContaining(['location', 'cached.primaryCity']));
    });

    it('multi city (CSV) ORs over each city × location / primaryCity', async () => {
        await request(app).get('/api/users/directory?city=Pune,Mumbai');
        const cityStage = findStage((s) => s.$match && Array.isArray(s.$match.$or)
            && s.$match.$or.some((c: any) => c.location || c['cached.primaryCity']));
        expect(cityStage.$match.$or).toHaveLength(4); // 2 cities × 2 fields
        const fields = cityStage.$match.$or.map((c: any) => Object.keys(c)[0]);
        expect(fields.filter((f: string) => f === 'location')).toHaveLength(2);
        expect(fields.filter((f: string) => f === 'cached.primaryCity')).toHaveLength(2);
    });

    it('artType (single) builds an artistType match', async () => {
        await request(app).get('/api/users/directory?artType=Dancer');
        expect(findStage((s) => s.$match && s.$match.artistType === 'Dancer')).toBeDefined();
    });

    it('artType (CSV) builds an artistType $in', async () => {
        await request(app).get('/api/users/directory?artType=Dancer,Singer');
        const st = findStage((s) => s.$match && s.$match.artistType && s.$match.artistType.$in);
        expect(st.$match.artistType.$in).toEqual(['Dancer', 'Singer']);
    });

    it('trust=verified builds trustTier === verified', async () => {
        await request(app).get('/api/users/directory?trust=verified');
        expect(findStage((s) => s.$match && s.$match.trustTier === 'verified')).toBeDefined();
    });

    it('trust=trusted builds trustTier $in [trusted, verified]', async () => {
        await request(app).get('/api/users/directory?trust=trusted');
        const st = findStage((s) => s.$match && s.$match.trustTier && s.$match.trustTier.$in);
        expect(st.$match.trustTier.$in).toEqual(['trusted', 'verified']);
    });

    it('hasMedia=1 builds an OR over photos/gallery/video', async () => {
        await request(app).get('/api/users/directory?hasMedia=1');
        const st = findStage((s) => s.$match && Array.isArray(s.$match.$or)
            && s.$match.$or.some((c: any) => c.hasPhotos === true));
        expect(st.$match.$or).toEqual(expect.arrayContaining([
            { hasPhotos: true },
            { 'galleryUrls.0': { $exists: true } },
            { 'videoUrls.0': { $exists: true } },
        ]));
    });

    it('q free-text ORs over name/headline/artistType AND org.organizationName', async () => {
        await request(app).get('/api/users/directory?q=acme');
        const st = findStage((s) => s.$match && Array.isArray(s.$match.$or)
            && s.$match.$or.some((c: any) => c.displayName));
        const fields = st.$match.$or.map((c: any) => Object.keys(c)[0]);
        expect(fields).toEqual(expect.arrayContaining([
            'displayName', 'headline', 'artistType', 'org.organizationName',
        ]));
    });

    it('uses the organizers collection in $lookup', async () => {
        await request(app).get('/api/users/directory');
        const lookup = findStage((s) => s.$lookup);
        expect(lookup.$lookup.from).toBe('organizers');
        expect(lookup.$lookup.localField).toBe('_id');
        expect(lookup.$lookup.foreignField).toBe('userId');
    });

    // Sort spec lives inside the $facet rows sub-pipeline.
    const facetSort = () => {
        const fc = findStage((s) => s.$facet);
        const sortStage = fc.$facet.rows.find((s: any) => s.$sort);
        return sortStage.$sort;
    };

    it('default sort = relevance (cached.featured desc, updatedAt desc)', async () => {
        await request(app).get('/api/users/directory');
        expect(facetSort()).toEqual({ 'cached.featured': -1, updatedAt: -1 });
    });

    it('sort=trust → trustScore desc', async () => {
        await request(app).get('/api/users/directory?sort=trust');
        expect(facetSort()).toEqual({ trustScore: -1, updatedAt: -1 });
    });

    it('sort=experience → experienceLevel desc', async () => {
        await request(app).get('/api/users/directory?sort=experience');
        expect(facetSort()).toEqual({ experienceLevel: -1, updatedAt: -1 });
    });

    // Pagination + total.
    it('total reflects the full filtered count, not the page size', async () => {
        mockAggregate.mockReturnValue(facet([{ _id: 'p1', displayName: 'One', role: 'artist', kind: 'artist' }], 7));
        const res = await request(app).get('/api/users/directory?pageSize=1');
        expect(res.body.data.people.length).toBe(1);
        expect(res.body.data.total).toBe(7);
    });

    it('clamps pageSize to 1..50 and computes skip from page', async () => {
        await request(app).get('/api/users/directory?page=3&pageSize=999');
        const fc = findStage((s) => s.$facet);
        const limitStage = fc.$facet.rows.find((s: any) => s.$limit != null);
        const skipStage = fc.$facet.rows.find((s: any) => s.$skip != null);
        expect(limitStage.$limit).toBe(50);       // clamped
        expect(skipStage.$skip).toBe((3 - 1) * 50); // (page-1)*limit
    });

    it('count comes from the $facet count branch', async () => {
        const fc = () => {
            const f = findStage((s) => s.$facet);
            return f.$facet;
        };
        await request(app).get('/api/users/directory');
        expect(fc().count).toEqual([{ $count: 'n' }]);
    });

    // 7. No filter-only field leakage in the mapped person objects.
    it('does not leak filter-only fields in the mapped card', async () => {
        mockAggregate.mockReturnValue(facet([
            { _id: 'x1', displayName: 'X', role: 'artist', kind: 'artist', artistType: ['Dancer'], hasPhotos: true, galleryUrls: ['g'], videoUrls: ['v'], experienceLevel: 'professional', gender: 'female', trustScore: 9 },
        ], 1));
        const res = await request(app).get('/api/users/directory');
        const card = res.body.data.people[0];
        for (const leaky of ['hasPhotos', 'galleryUrls', 'videoUrls', 'experienceLevel', 'gender', 'trustScore']) {
            expect(card).not.toHaveProperty(leaky);
        }
    });

    it('the $project stage never selects filter-only fields', async () => {
        await request(app).get('/api/users/directory');
        const fc = findStage((s) => s.$facet);
        const proj = fc.$facet.rows.find((s: any) => s.$project).$project;
        for (const leaky of ['hasPhotos', 'galleryUrls', 'videoUrls', 'experienceLevel', 'gender', 'trustScore']) {
            expect(proj).not.toHaveProperty(leaky);
        }
    });
});
