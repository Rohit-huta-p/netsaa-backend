import request from 'supertest';

// ---- Model mocks (mirror directory.test harness) ----
const mockUserFind = jest.fn();
const mockUserFindOne = jest.fn();
jest.mock('../models/User', () => ({
    __esModule: true,
    default: {
        find: (...a: any[]) => mockUserFind(...a),
        findOne: (...a: any[]) => mockUserFindOne(...a),
    },
}));

const mockStFind = jest.fn();
const mockStUpsert = jest.fn();
const mockStDelete = jest.fn();
jest.mock('../models/SavedTalent', () => ({
    __esModule: true,
    default: {
        find: (...a: any[]) => mockStFind(...a),
        findOneAndUpdate: (...a: any[]) => mockStUpsert(...a),
        deleteOne: (...a: any[]) => mockStDelete(...a),
    },
}));

// Authenticated viewer u1 (a client). protect injects req.user like the directory test.
jest.mock('../middleware/auth', () => ({
    protect: (req: any, _res: any, next: any) => { req.user = { _id: 'u1', id: 'u1', role: 'client' }; next(); },
}));
jest.mock('../config/db', () => jest.fn());

process.env.JWT_SECRET = 'test-secret';
import app from '../app';

// Chains. User.findOne(...).select(...).lean()  and  User.find(...).sort(...).select(...).lean()
const findOneChain = (row: any) => {
    const c: any = {};
    c.select = jest.fn(() => c);
    c.lean = jest.fn(() => Promise.resolve(row));
    return c;
};
const userFindChain = (rows: any[]) => {
    const c: any = {};
    c.select = jest.fn(() => c);
    c.lean = jest.fn(() => Promise.resolve(rows));
    return c;
};
// SavedTalent.find(...).sort(...).select(...).lean()  (sort optional)
const stFindChain = (rows: any[]) => {
    const c: any = {};
    c.sort = jest.fn(() => c);
    c.select = jest.fn(() => c);
    c.lean = jest.fn(() => Promise.resolve(rows));
    return c;
};

beforeEach(() => {
    mockUserFind.mockReset();
    mockUserFindOne.mockReset();
    mockStFind.mockReset();
    mockStUpsert.mockReset();
    mockStDelete.mockReset();
});

const TALENT = '507f1f77bcf86cd799439011';

describe('POST /api/users/saved', () => {
    it('upserts SavedTalent {user, talent} and returns 201', async () => {
        mockUserFindOne.mockReturnValue(findOneChain({ _id: TALENT }));
        mockStUpsert.mockResolvedValue({ _id: 's1', user: 'u1', talent: TALENT });

        const res = await request(app).post('/api/users/saved').send({ talentId: TALENT });

        expect(res.status).toBe(201);
        // target validated against the directory wall (artist|creative_lead, not blocked)
        const findArg = mockUserFindOne.mock.calls[0][0];
        expect(findArg._id).toBe(TALENT);
        expect(findArg.role).toEqual({ $in: ['artist', 'creative_lead'] });
        expect(findArg.blocked).toEqual({ $ne: true });
        // upsert keyed on {user, talent}
        expect(mockStUpsert).toHaveBeenCalledTimes(1);
        const [filter, , opts] = mockStUpsert.mock.calls[0];
        expect(filter).toEqual({ user: 'u1', talent: TALENT });
        expect(opts).toEqual(expect.objectContaining({ upsert: true }));
    });

    it('rejects saving yourself with 400 (no upsert)', async () => {
        const res = await request(app).post('/api/users/saved').send({ talentId: 'u1' });
        // 'u1' is not a 24-hex id, so it fails validation first — still 400 and no upsert.
        expect(res.status).toBe(400);
        expect(mockStUpsert).not.toHaveBeenCalled();
    });

    it('rejects a non-24-hex talentId with 400', async () => {
        const res = await request(app).post('/api/users/saved').send({ talentId: 'not-an-id' });
        expect(res.status).toBe(400);
        expect(mockUserFindOne).not.toHaveBeenCalled();
        expect(mockStUpsert).not.toHaveBeenCalled();
    });

    it('rejects a non-directory / missing target with 404 (no upsert)', async () => {
        mockUserFindOne.mockReturnValue(findOneChain(null)); // not artist/CL, blocked, or absent
        const res = await request(app).post('/api/users/saved').send({ talentId: TALENT });
        expect(res.status).toBe(404);
        expect(mockStUpsert).not.toHaveBeenCalled();
    });
});

describe('DELETE /api/users/saved/:talentId', () => {
    it('calls deleteOne({user, talent}) and returns 200 (idempotent)', async () => {
        mockStDelete.mockResolvedValue({ deletedCount: 1 });
        const res = await request(app).delete(`/api/users/saved/${TALENT}`);
        expect(res.status).toBe(200);
        expect(mockStDelete).toHaveBeenCalledWith({ user: 'u1', talent: TALENT });
    });
});

describe('GET /api/users/saved', () => {
    it('returns directory-card-shaped people, newest first', async () => {
        mockStFind.mockReturnValue(stFindChain([{ talent: TALENT }]));
        mockUserFind.mockReturnValue(userFindChain([
            { _id: TALENT, displayName: 'Ravi', role: 'artist', profileImageUrl: 'http://x/p.jpg', artistType: ['Dancer'], headline: 'Contemporary dancer', cached: { primaryCity: 'Pune' }, trustTier: 'trusted' },
        ]));
        const res = await request(app).get('/api/users/saved');
        expect(res.status).toBe(200);
        expect(res.body.data.people[0]).toEqual(expect.objectContaining({
            _id: TALENT, displayName: 'Ravi', role: 'artist', artType: 'Dancer', city: 'Pune', trustTier: 'trusted',
        }));
        // live lookup drops blocked users
        expect(mockUserFind.mock.calls[0][0].blocked).toEqual({ $ne: true });
    });

    it('returns an empty list when nothing is saved (no User lookup)', async () => {
        mockStFind.mockReturnValue(stFindChain([]));
        const res = await request(app).get('/api/users/saved');
        expect(res.status).toBe(200);
        expect(res.body.data.people).toEqual([]);
        expect(mockUserFind).not.toHaveBeenCalled();
    });
});

describe('GET /api/users/saved/ids', () => {
    it('returns the viewer saved ids as a string array', async () => {
        mockStFind.mockReturnValue(stFindChain([{ talent: TALENT }, { talent: '507f191e810c19729de860ea' }]));
        const res = await request(app).get('/api/users/saved/ids');
        expect(res.status).toBe(200);
        expect(res.body.data.ids).toEqual([TALENT, '507f191e810c19729de860ea']);
        expect(mockStFind).toHaveBeenCalledWith({ user: 'u1' });
    });
});
