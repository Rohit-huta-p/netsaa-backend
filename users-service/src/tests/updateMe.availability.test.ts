/**
 * Verifies PATCH /api/auth/me accepts and persists the `availability` enum.
 *
 * Mirrors the mocked-DB pattern from settings.test.ts: jest.mock('../models/User')
 * and a chainable query mock. Avoids mongodb-memory-server because the rest of the
 * test suite does not use it.
 */
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

import app from '../app';
import User from '../models/User';

const JWT_SECRET = 'test_secret';

const generateToken = (id: string, role = 'artist') =>
    jwt.sign({ user: { id, role } }, JWT_SECRET, { expiresIn: '1h' });

// Chainable Mongoose query mock (resolves on `await` and `.select()`)
const createMockQuery = (resolvedValue: any) => ({
    select: jest.fn().mockResolvedValue(resolvedValue),
    then: (resolve: any) => resolve(resolvedValue),
});

const userId = '507f1f77bcf86cd799439011';

const mockUserPayload = (overrides: Record<string, any> = {}) => ({
    _id: userId,
    role: 'artist',
    email: 'test@example.com',
    passwordHash: 'hashed_secret',
    blocked: false,
    toObject() { return this; },
    save: jest.fn(),
    ...overrides,
});

describe('PATCH /api/auth/me — availability field', () => {
    let token: string;

    beforeAll(() => {
        process.env.JWT_SECRET = JWT_SECRET;
        jest.spyOn(console, 'log').mockImplementation(() => {});
        jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    beforeEach(() => {
        jest.clearAllMocks();
        token = generateToken(userId);
    });

    test('persists availability when set to a valid enum value', async () => {
        // Auth middleware lookup
        (User.findById as jest.Mock).mockReturnValue(
            createMockQuery(mockUserPayload())
        );
        // Update returns the patched user
        (User.findByIdAndUpdate as jest.Mock).mockReturnValue(
            createMockQuery(mockUserPayload({ availability: 'available' }))
        );

        const res = await request(app)
            .patch('/api/auth/me')
            .set('Authorization', `Bearer ${token}`)
            .send({ availability: 'available' });

        expect(res.status).toBe(200);
        expect(res.body.availability).toBe('available');

        // Confirm the controller wrote `availability` into the $set payload
        expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
            userId,
            { $set: expect.objectContaining({ availability: 'available' }) },
            expect.objectContaining({ new: true, runValidators: true })
        );
    });

    test('does not write availability when the field is omitted from the body', async () => {
        (User.findById as jest.Mock).mockReturnValue(
            createMockQuery(mockUserPayload())
        );
        (User.findByIdAndUpdate as jest.Mock).mockReturnValue(
            createMockQuery(mockUserPayload({ headline: 'New headline' }))
        );

        const res = await request(app)
            .patch('/api/auth/me')
            .set('Authorization', `Bearer ${token}`)
            .send({ headline: 'New headline' });

        expect(res.status).toBe(200);
        const setPayload = (User.findByIdAndUpdate as jest.Mock).mock.calls[0][1].$set;
        expect(setPayload).not.toHaveProperty('availability');
    });

    test('passes through to Mongoose so enum validation runs (runValidators: true)', async () => {
        (User.findById as jest.Mock).mockReturnValue(
            createMockQuery(mockUserPayload())
        );
        // Simulate Mongoose rejecting an invalid enum value when runValidators is on.
        (User.findByIdAndUpdate as jest.Mock).mockImplementation(() => {
            const err: any = new Error('Validation failed: availability: `maybe` is not a valid enum value.');
            err.name = 'ValidationError';
            return {
                select: jest.fn().mockRejectedValue(err),
                then: (_resolve: any, reject: any) => reject(err),
            };
        });

        const res = await request(app)
            .patch('/api/auth/me')
            .set('Authorization', `Bearer ${token}`)
            .send({ availability: 'maybe' });

        // Controller currently returns 500 on any error (matches existing behavior);
        // the important thing is invalid input does NOT silently succeed.
        expect(res.status).toBeGreaterThanOrEqual(400);
        expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
            userId,
            { $set: expect.objectContaining({ availability: 'maybe' }) },
            expect.objectContaining({ runValidators: true })
        );
    });
});
