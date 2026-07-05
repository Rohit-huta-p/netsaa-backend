import request from 'supertest';
import jwt from 'jsonwebtoken';

// ── Mocks MUST be defined before importing app/controllers ──
jest.mock('../models/User');
jest.mock('../models/Artist');
jest.mock('../models/Organizer');
jest.mock('../connections/connections.model');
jest.mock('../notifications/notification.model');
jest.mock('bcryptjs', () => ({
    compare: jest.fn().mockResolvedValue(true),
    genSalt: jest.fn().mockResolvedValue('salt'),
    hash: jest.fn().mockResolvedValue('hashed_secret')
}));

// Now import the app (which imports routes -> controllers -> models)
import app from '../app';
import User from '../models/User';

const JWT_SECRET = 'test_secret';
const userId = '507f1f77bcf86cd799439011'; // Dummy ObjectId

const generateToken = (id: string, role = 'artist') => {
    return jwt.sign({ user: { id, role } }, JWT_SECRET, { expiresIn: '1h' });
};

// Helper to create a Chainable Mongoose Query Mock (mirrors settings.test.ts)
const createMockQuery = (resolvedValue: any) => {
    return {
        select: jest.fn().mockResolvedValue(resolvedValue),
        then: (resolve: any) => resolve(resolvedValue) // Supports await User.findById()
    };
};

describe('videoReels field on PATCH /api/auth/me', () => {
    let userToken: string;

    beforeAll(() => {
        process.env.JWT_SECRET = JWT_SECRET;
        jest.spyOn(console, 'log').mockImplementation(() => { });
        jest.spyOn(console, 'error').mockImplementation(() => { });
    });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('PATCH /api/auth/me persists videoReels', async () => {
        userToken = generateToken(userId);

        const reels = [{
            muxPlaybackId: 'pb_1',
            status: 'ready',
            thumbnailUrl: 'https://image.mux.com/pb_1/thumbnail.jpg',
            duration: 12,
            aspectRatio: '9:16',
        }];

        // protect middleware: User.findById(decoded.user.id) — awaited directly, no .select()
        (User.findById as jest.Mock).mockResolvedValue({ _id: userId, role: 'artist' });

        // updateMe: User.findByIdAndUpdate(...).select('-passwordHash')
        (User.findByIdAndUpdate as jest.Mock).mockReturnValue(
            createMockQuery({ _id: userId, videoReels: reels })
        );

        const res = await request(app)
            .patch('/api/auth/me')
            .set('Authorization', `Bearer ${userToken}`)
            .send({ videoReels: reels });

        expect(res.status).toBe(200);

        const call = (User.findByIdAndUpdate as jest.Mock).mock.calls[0];
        expect(call[1].$set.videoReels).toEqual(reels);
    });
});
