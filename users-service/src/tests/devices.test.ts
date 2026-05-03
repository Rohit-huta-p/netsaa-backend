/**
 * Tests for the device-token registration endpoints.
 *
 * Plan 5 — push delivery requires the User document to carry an array
 * of `{ deviceId, platform, pushToken, ... }` rows. The mobile client
 * registers via POST /api/users/me/devices on cold-start AND on every
 * FCM/APNs token refresh. Same deviceId → upsert; new deviceId → push.
 *
 * Uses the same mocked-User pattern as settings.test.ts /
 * updateMe.availability.test.ts (no mongodb-memory-server).
 */

import request from 'supertest';
import jwt from 'jsonwebtoken';

// Mocks MUST come before app import.
jest.mock('../models/User');
jest.mock('../models/Artist');
jest.mock('../models/Organizer');
jest.mock('../connections/connections.model');
jest.mock('../notifications/notification.model');
jest.mock('bcryptjs', () => ({
    compare: jest.fn().mockResolvedValue(true),
    genSalt: jest.fn().mockResolvedValue('salt'),
    hash: jest.fn().mockResolvedValue('hashed_secret'),
}));

import app from '../app';
import User from '../models/User';

const JWT_SECRET = 'test_secret';
const userId = '507f1f77bcf86cd799439011';

const generateToken = (id: string = userId, role: string = 'artist') =>
    jwt.sign({ user: { id, role } }, JWT_SECRET, { expiresIn: '1h' });

const mockUser = (overrides: Record<string, any> = {}) => ({
    _id: userId,
    role: 'artist',
    email: 'test@example.com',
    blocked: false,
    devices: [],
    toObject() { return this; },
    save: jest.fn(),
    ...overrides,
});

beforeAll(() => {
    process.env.JWT_SECRET = JWT_SECRET;
    jest.spyOn(console, 'log').mockImplementation(() => { });
    jest.spyOn(console, 'error').mockImplementation(() => { });
});

beforeEach(() => {
    jest.clearAllMocks();

    // The `protect` middleware does User.findById(decoded.user.id)
    // — return a thenable user payload so the auth check passes.
    (User.findById as jest.Mock).mockImplementation(() => ({
        select: jest.fn().mockResolvedValue(mockUser()),
        // `User.findById(...)` is sometimes awaited directly and sometimes
        // chained with .select(). The thenable below makes both work.
        then: (resolve: any) => resolve(mockUser()),
    }));
});

describe('POST /api/users/me/devices', () => {
    it('400 when deviceId is missing', async () => {
        const res = await request(app)
            .post('/api/users/me/devices')
            .set('Authorization', `Bearer ${generateToken()}`)
            .send({ platform: 'ios', pushToken: 'tok-abc' });

        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/deviceId/i);
    });

    it('400 when platform is invalid', async () => {
        const res = await request(app)
            .post('/api/users/me/devices')
            .set('Authorization', `Bearer ${generateToken()}`)
            .send({ deviceId: 'd-1', platform: 'blackberry', pushToken: 'tok' });

        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/platform/i);
    });

    it('400 when pushToken is missing', async () => {
        const res = await request(app)
            .post('/api/users/me/devices')
            .set('Authorization', `Bearer ${generateToken()}`)
            .send({ deviceId: 'd-1', platform: 'ios' });

        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/pushToken/i);
    });

    it('200 + UPSERT path: existing deviceId — $set positional update', async () => {
        // Existing device matched → findOneAndUpdate returns the doc.
        (User.findOneAndUpdate as jest.Mock).mockReturnValue({
            lean: jest.fn().mockResolvedValue({
                _id: userId,
                devices: [
                    {
                        _id: 'sub-1',
                        deviceId: 'd-1',
                        platform: 'ios',
                        appVersion: '1.0.0',
                    },
                ],
            }),
        });
        // The reload at the end:
        (User.findById as jest.Mock).mockImplementation((id: string) => {
            if (id === userId) {
                return {
                    select: jest.fn().mockReturnValue({
                        lean: jest.fn().mockResolvedValue({
                            _id: userId,
                            devices: [
                                {
                                    _id: 'sub-1',
                                    deviceId: 'd-1',
                                    platform: 'ios',
                                    appVersion: '1.0.0',
                                },
                            ],
                        }),
                    }),
                    then: (resolve: any) => resolve(mockUser()),
                };
            }
            // protect-middleware lookup
            return {
                select: jest.fn().mockResolvedValue(mockUser()),
                then: (resolve: any) => resolve(mockUser()),
            };
        });

        const res = await request(app)
            .post('/api/users/me/devices')
            .set('Authorization', `Bearer ${generateToken()}`)
            .send({
                deviceId: 'd-1',
                platform: 'ios',
                pushToken: 'tok-new',
                appVersion: '1.0.0',
            });

        expect(res.status).toBe(200);
        expect(res.body.data?.devices?.length).toBe(1);
        // pushToken must NOT be returned to the client.
        expect(res.body.data?.devices?.[0]?.pushToken).toBeUndefined();
        expect(User.findOneAndUpdate).toHaveBeenCalledTimes(1);
        // No $push fallback because the upsert hit.
        expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    it('200 + INSERT path: new deviceId — $push fallback', async () => {
        // First findOneAndUpdate returns null (no match).
        (User.findOneAndUpdate as jest.Mock).mockReturnValue({
            lean: jest.fn().mockResolvedValue(null),
        });
        // $push fallback succeeds.
        (User.findByIdAndUpdate as jest.Mock).mockReturnValue({
            lean: jest.fn().mockResolvedValue({ _id: userId }),
        });
        // Reload:
        (User.findById as jest.Mock).mockImplementation((id: string) => {
            if (id === userId) {
                return {
                    select: jest.fn().mockReturnValue({
                        lean: jest.fn().mockResolvedValue({
                            _id: userId,
                            devices: [
                                {
                                    _id: 'new-1',
                                    deviceId: 'd-new',
                                    platform: 'android',
                                    registeredAt: new Date(),
                                },
                            ],
                        }),
                    }),
                    then: (resolve: any) => resolve(mockUser()),
                };
            }
            return {
                select: jest.fn().mockResolvedValue(mockUser()),
                then: (resolve: any) => resolve(mockUser()),
            };
        });

        const res = await request(app)
            .post('/api/users/me/devices')
            .set('Authorization', `Bearer ${generateToken()}`)
            .send({
                deviceId: 'd-new',
                platform: 'android',
                pushToken: 'tok-fresh',
            });

        expect(res.status).toBe(200);
        expect(res.body.data?.devices?.[0]?.deviceId).toBe('d-new');
        expect(User.findByIdAndUpdate).toHaveBeenCalled();
    });

    it('401 without auth token', async () => {
        const res = await request(app)
            .post('/api/users/me/devices')
            .send({ deviceId: 'd-1', platform: 'ios', pushToken: 'tok' });

        expect(res.status).toBe(401);
    });
});

describe('GET /api/users/me/devices', () => {
    it('200 lists this user\'s devices, never returning pushToken', async () => {
        (User.findById as jest.Mock).mockImplementation((id: string) => {
            if (id === userId) {
                return {
                    select: jest.fn().mockReturnValue({
                        lean: jest.fn().mockResolvedValue({
                            _id: userId,
                            devices: [
                                {
                                    _id: 'sub-1',
                                    deviceId: 'd-1',
                                    platform: 'ios',
                                    pushToken: 'SECRET-NEVER-LEAK',
                                    appVersion: '1.0.0',
                                    revoked: false,
                                },
                            ],
                        }),
                    }),
                    then: (resolve: any) => resolve(mockUser()),
                };
            }
            // protect-middleware lookup
            return {
                select: jest.fn().mockResolvedValue(mockUser()),
                then: (resolve: any) => resolve(mockUser()),
            };
        });

        const res = await request(app)
            .get('/api/users/me/devices')
            .set('Authorization', `Bearer ${generateToken()}`);

        expect(res.status).toBe(200);
        expect(res.body.data?.devices?.length).toBe(1);
        const d = res.body.data.devices[0];
        expect(d.deviceId).toBe('d-1');
        expect(d.pushToken).toBeUndefined();
        expect(JSON.stringify(res.body)).not.toContain('SECRET-NEVER-LEAK');
    });
});

describe('DELETE /api/users/me/devices/:deviceId', () => {
    it('200 removes the device entry', async () => {
        (User.findByIdAndUpdate as jest.Mock).mockResolvedValue({
            _id: userId,
            devices: [],
        });

        const res = await request(app)
            .delete('/api/users/me/devices/d-1')
            .set('Authorization', `Bearer ${generateToken()}`);

        expect(res.status).toBe(200);
        expect(res.body.message).toMatch(/unregister/i);
        expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
            userId,
            { $pull: { devices: { deviceId: 'd-1' } } },
            expect.anything()
        );
    });

    it('401 without auth token', async () => {
        const res = await request(app).delete('/api/users/me/devices/d-1');
        expect(res.status).toBe(401);
    });
});
