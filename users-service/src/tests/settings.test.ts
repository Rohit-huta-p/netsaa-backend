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
import Artist from '../models/Artist';
import Organizer from '../models/Organizer';
import Connection from '../connections/connections.model';
import Notification from '../notifications/notification.model';

const JWT_SECRET = 'test_secret';

// Helper to generate token
const generateToken = (id: string, role = 'artist') => {
    return jwt.sign({ user: { id, role } }, JWT_SECRET, { expiresIn: '1h' });
};

describe('Settings & Danger Zone API (Mocked DB)', () => {
    let userToken: string;
    const userId = '507f1f77bcf86cd799439011'; // Dummy ObjectId

    beforeAll(() => {
        process.env.JWT_SECRET = JWT_SECRET;
        // Suppress console logs during tests to keep output clean
        jest.spyOn(console, 'log').mockImplementation(() => { });
        jest.spyOn(console, 'error').mockImplementation(() => { });
    });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    // Mock implementation helper
    const mockUserPayload = (settingsOverride = {}) => ({
        _id: userId,
        role: 'artist',
        email: 'test@example.com',
        passwordHash: 'hashed_secret', // Needed for danger zone
        settings: {
            privacy: { profileVisibility: 'public' },
            notifications: { allowConnectionRequests: true, emailNotifications: true },
            messaging: { allowMessagesFrom: 'everyone' },
            account: { language: 'en' },
            ...settingsOverride
        },
        blocked: false,
        toObject: function () { return this; },
        save: jest.fn()
    });

    // Helper to create a Chainable Mongoose Query Mock
    const createMockQuery = (resolvedValue: any) => {
        return {
            select: jest.fn().mockResolvedValue(resolvedValue),
            then: (resolve: any) => resolve(resolvedValue) // Supports await User.findById()
        };
    };

    /**
     * Test Case 1: GET Settings
     */
    test('GET /api/users/me/settings - Returns normalized settings', async () => {
        const mockUser = mockUserPayload();
        (User.findById as jest.Mock).mockReturnValue(createMockQuery(mockUser));

        userToken = generateToken(userId);

        const res = await request(app)
            .get('/api/users/me/settings')
            .set('Authorization', `Bearer ${userToken}`);

        expect(res.status).toBe(200);
        expect(res.body.data.settings.privacy.profileVisibility).toBe('public');
    });

    /**
     * Test Case 2: PATCH Validation - Invalid Enum
     */
    test('PATCH /api/users/me/settings - Validation: Invalid Enum', async () => {
        userToken = generateToken(userId);
        // Auth middleware needs user
        (User.findById as jest.Mock).mockReturnValue(createMockQuery(mockUserPayload()));

        const res = await request(app)
            .patch('/api/users/me/settings')
            .set('Authorization', `Bearer ${userToken}`)
            .send({
                privacy: { profileVisibility: 'invisible' } // Invalid enum
            });

        expect(res.status).toBe(400);
        expect(res.body.meta.message).toMatch(/Validation failed/);
    });

    /**
     * Test Case 3: Messaging Permission Constraint
     */
    test('PATCH /api/users/me/settings - Messaging Constraint', async () => {
        userToken = generateToken(userId);

        // User has allowConnectionRequests: false in DB
        const dbUser = mockUserPayload({
            notifications: { allowConnectionRequests: false }
        });
        (User.findById as jest.Mock).mockReturnValue(createMockQuery(dbUser));

        const res = await request(app)
            .patch('/api/users/me/settings')
            .set('Authorization', `Bearer ${userToken}`)
            .send({
                messaging: { allowMessagesFrom: 'connections' }
            });

        expect(res.status).toBe(400);
        expect(res.body.meta.message).toMatch(/allowMessagesFrom cannot be 'connections'/);
    });

    /**
     * Test Case 4: Permissions - Unauthorized
     */
    test('PATCH /api/users/me/settings - Unauthorized (No Token)', async () => {
        const res = await request(app)
            .patch('/api/users/me/settings')
            .send({ account: { language: 'fr' } });

        expect(res.status).toBe(401);
    });

    /**
     * Test Case 5: Partial Update & Deep Merge Logic
     */
    test('PATCH /api/users/me/settings - Partial Update Logic', async () => {
        userToken = generateToken(userId);

        // findById (Auth + Constraint check)
        (User.findById as jest.Mock).mockReturnValue(createMockQuery(mockUserPayload()));

        // findByIdAndUpdate
        const updatedMockUser = mockUserPayload({
            account: { language: 'es', timezone: 'UTC' }
        });
        (User.findByIdAndUpdate as jest.Mock).mockReturnValue(createMockQuery(updatedMockUser));

        const res = await request(app)
            .patch('/api/users/me/settings')
            .set('Authorization', `Bearer ${userToken}`)
            .send({
                account: { language: 'es' }
            });

        expect(res.status).toBe(200);

        // Verify update arguments
        expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
            userId, // This should now be correct
            {
                $set: {
                    'settings.account.language': 'es'
                }
            },
            expect.anything()
        );
    });

    /**
     * Test Case 6: Deactivate Behavior (Danger Zone)
     */
    test('POST /api/users/me/deactivate - Sets blocked flag', async () => {
        userToken = generateToken(userId);

        const mockUser = mockUserPayload();
        // findById (Auth + Deactivate lookup)
        (User.findById as jest.Mock).mockReturnValue(createMockQuery(mockUser));

        // findByIdAndUpdate
        (User.findByIdAndUpdate as jest.Mock).mockReturnValue(createMockQuery(mockUser));

        const res = await request(app)
            .post('/api/users/me/deactivate')
            .set('Authorization', `Bearer ${userToken}`)
            .send({ password: 'any_password' });

        expect(res.status).toBe(200);

        // Verify save called
        expect(mockUser.save).toHaveBeenCalled();
    });

    /**
     * Test Case 7: Delete Account & Cascade (Danger Zone)
     */
    test('POST /api/users/me/delete - Soft delete & Cascade', async () => {
        userToken = generateToken(userId);

        const mockUser = mockUserPayload();
        // findById (Auth + Delete lookup)
        (User.findById as jest.Mock).mockReturnValue(createMockQuery(mockUser));
        // findByIdAndUpdate
        (User.findByIdAndUpdate as jest.Mock).mockReturnValue(createMockQuery(mockUser));

        // Mock cascade models
        (Artist.deleteOne as jest.Mock).mockResolvedValue({});
        (Organizer.deleteOne as jest.Mock).mockResolvedValue({});
        (Connection.deleteMany as jest.Mock).mockResolvedValue({});
        (Notification.deleteMany as jest.Mock).mockResolvedValue({});

        const res = await request(app)
            .post('/api/users/me/delete')
            .set('Authorization', `Bearer ${userToken}`)
            .send({ password: 'any_password', reason: 'cleanup' });

        expect(res.status).toBe(200);

        // Verify Soft Delete
        expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
            userId,
            expect.objectContaining({
                $set: expect.objectContaining({
                    blocked: true,
                    displayName: 'Deleted User',
                    passwordHash: null
                })
            })
        );

        // Verify Cascade calls
        expect(Artist.deleteOne).toHaveBeenCalledWith({ userId });
        expect(Organizer.deleteOne).toHaveBeenCalledWith({ userId });
        expect(Connection.deleteMany).toHaveBeenCalled();
        expect(Notification.deleteMany).toHaveBeenCalled();
    });

});
