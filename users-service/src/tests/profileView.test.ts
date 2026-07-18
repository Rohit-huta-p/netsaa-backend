import request from 'supertest';

const mockPvUpdateOne = jest.fn();
const mockPvCount = jest.fn();
jest.mock('../models/ProfileView', () => ({
  __esModule: true,
  default: {
    updateOne: (...a: any[]) => mockPvUpdateOne(...a),
    countDocuments: (...a: any[]) => mockPvCount(...a),
  },
}));

const mockArtistUpdate = jest.fn();
const mockArtistFindOne = jest.fn();
jest.mock('../models/Artist', () => ({
  __esModule: true,
  default: {
    findOneAndUpdate: (...a: any[]) => mockArtistUpdate(...a),
    findOne: (...a: any[]) => mockArtistFindOne(...a),
  },
}));

// The recordProfileView trigger looks up the viewer's name and emits
// `profile.viewed`. Mock both so the controller never hits the DB / Redis.
const mockUserFindById = jest.fn();
jest.mock('../models/User', () => ({
  __esModule: true,
  default: { findById: (...a: any[]) => mockUserFindById(...a) },
}));

const mockEmitProfileViewed = jest.fn();
jest.mock('../notifications/event.emitter', () => ({
  notificationEvents: { emitProfileViewed: (...a: any[]) => mockEmitProfileViewed(...a) },
}));

// Authenticated viewer u1.
jest.mock('../middleware/auth', () => ({
  protect: (req: any, _res: any, next: any) => { req.user = { _id: 'u1', id: 'u1', role: 'artist' }; next(); },
}));
jest.mock('../config/db', () => jest.fn());

process.env.JWT_SECRET = 'test-secret';
import app from '../app';

const findOneLean = (row: any) => {
  const c: any = {};
  c.select = jest.fn(() => c);
  c.lean = jest.fn(() => Promise.resolve(row));
  return c;
};

const TARGET = '507f1f77bcf86cd799439011';

beforeEach(() => {
  mockPvUpdateOne.mockReset();
  mockPvCount.mockReset();
  mockArtistUpdate.mockReset();
  mockArtistFindOne.mockReset();
  mockUserFindById.mockReset();
  mockEmitProfileViewed.mockReset();
  // Default: the viewer resolves to a named user.
  mockUserFindById.mockReturnValue(findOneLean({ displayName: 'Priya' }));
});

describe('POST /api/users/:id/view', () => {
  it('records a first daily view (204) and increments the artist counter', async () => {
    mockPvUpdateOne.mockResolvedValue({ upsertedCount: 1 });
    mockArtistUpdate.mockResolvedValue({});
    const res = await request(app).post(`/api/users/${TARGET}/view`);
    expect(res.status).toBe(204);
    const [filter, update, opts] = mockPvUpdateOne.mock.calls[0];
    expect(filter).toEqual(expect.objectContaining({ viewerId: 'u1', viewedUserId: TARGET }));
    expect(opts).toEqual(expect.objectContaining({ upsert: true }));
    expect(mockArtistUpdate).toHaveBeenCalledTimes(1);
    const [aFilter, aUpdate] = mockArtistUpdate.mock.calls[0];
    expect(aFilter).toEqual({ userId: TARGET });
    expect(aUpdate).toEqual({ $inc: { 'stats.profileViews': 1 } });
    // and fires the profile.viewed notification to the profile owner
    expect(mockEmitProfileViewed).toHaveBeenCalledWith(
      expect.objectContaining({ viewedUserId: TARGET, viewerId: 'u1', viewerName: 'Priya' })
    );
  });

  it('does NOT increment on a repeat same-day view (upsertedCount 0)', async () => {
    mockPvUpdateOne.mockResolvedValue({ upsertedCount: 0 });
    const res = await request(app).post(`/api/users/${TARGET}/view`);
    expect(res.status).toBe(204);
    expect(mockArtistUpdate).not.toHaveBeenCalled();
    expect(mockEmitProfileViewed).not.toHaveBeenCalled();
  });

  it('ignores a self-view (204, no writes)', async () => {
    const res = await request(app).post('/api/users/u1/view');
    expect(res.status).toBe(204);
    expect(mockPvUpdateOne).not.toHaveBeenCalled();
    expect(mockArtistUpdate).not.toHaveBeenCalled();
  });

  it('rejects a non-24-hex id with 400', async () => {
    const res = await request(app).post('/api/users/not-an-id/view');
    expect(res.status).toBe(400);
    expect(mockPvUpdateOne).not.toHaveBeenCalled();
  });
});

describe('GET /api/users/me/profile-views', () => {
  it('returns { total, last7 } from the artist counter + 7-day count', async () => {
    mockArtistFindOne.mockReturnValue(findOneLean({ stats: { profileViews: 1284 } }));
    mockPvCount.mockResolvedValue(38);
    const res = await request(app).get('/api/users/me/profile-views');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ total: 1284, last7: 38 });
    expect(mockArtistFindOne).toHaveBeenCalledWith({ userId: 'u1' });
    const countArg = mockPvCount.mock.calls[0][0];
    expect(countArg.viewedUserId).toBe('u1');
    expect(countArg.at).toHaveProperty('$gte');
  });

  it('defaults total to 0 when the caller has no Artist doc', async () => {
    mockArtistFindOne.mockReturnValue(findOneLean(null));
    mockPvCount.mockResolvedValue(0);
    const res = await request(app).get('/api/users/me/profile-views');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ total: 0, last7: 0 });
  });
});
