import request from 'supertest';

process.env.ENABLE_SOCKET_REDIS = 'false';

jest.mock('../email/email.queue', () => ({
    __esModule: true,
    emailQueue: { add: jest.fn().mockResolvedValue(undefined) },
}));

const mockSessionFindOne = jest.fn();
const mockUserFindOne = jest.fn();
const mockUserCreate = jest.fn();

jest.mock('../models/User', () => ({
    __esModule: true,
    default: {
        findOne: (...a: any[]) => mockUserFindOne(...a),
        create: (...a: any[]) => mockUserCreate(...a),
    },
}));
// OtpSession import path used by otp.controller: '../models/otpSession.model'
jest.mock('../modules/auth/models/otpSession.model', () => ({
    __esModule: true,
    default: {
        findOne: (...a: any[]) => mockSessionFindOne(...a),
        findOneAndUpdate: jest.fn().mockResolvedValue({ _id: 's1' }),
    },
}));
// otp.service import path used by otp.controller: '../services/otp.service'
jest.mock('../modules/auth/services/otp.service', () => ({
    __esModule: true,
    hashOTP: () => 'HASH',
    generateNumericOTP: () => '123456',
    isValidE164Phone: () => true,
    checkRateLimit: () => Promise.resolve(false),
}));
// sms.service is loaded at module-init time by otp.controller
jest.mock('../services/sms.service', () => ({
    __esModule: true,
    sendSms: jest.fn().mockResolvedValue(true),
}));

process.env.JWT_SECRET = 'test-secret';

import app from '../app';
import jwt from 'jsonwebtoken';

const validSession = () => ({
    phone: '+919876543210',
    otpHash: 'HASH',
    attempts: 0,
    isUsed: false,
    expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    save: jest.fn().mockResolvedValue(undefined),
});
const chain = (val: any) => ({ sort: () => Promise.resolve(val) });

describe('POST /api/auth/verify-otp — client registration path', () => {
    beforeEach(() => {
        mockSessionFindOne.mockReset();
        mockUserFindOne.mockReset();
        mockUserCreate.mockReset();
    });

    it('still 404s for unknown phone WITHOUT a registration payload (artist/CL login unchanged)', async () => {
        mockSessionFindOne.mockReturnValue(chain(validSession()));
        mockUserFindOne.mockResolvedValue(null);
        const res = await request(app)
            .post('/api/auth/verify-otp')
            .send({ phone: '+919876543210', otp: '123456' });
        expect(res.status).toBe(404);
        expect(res.body.data.userExists).toBe(false);
        expect(mockUserCreate).not.toHaveBeenCalled();
    });

    it('creates a client account when registration payload is present', async () => {
        mockSessionFindOne.mockReturnValue(chain(validSession()));
        mockUserFindOne.mockResolvedValue(null);
        mockUserCreate.mockResolvedValue({
            id: 'u9', _id: 'u9', role: 'client', displayName: 'Anjali Sharma',
            phoneNumber: '+919876543210', cached: {}, kycStatus: 'unverified',
            toObject() { return { _id: 'u9', role: 'client', displayName: 'Anjali Sharma' }; },
        });
        const res = await request(app).post('/api/auth/verify-otp').send({
            phone: '+919876543210',
            otp: '123456',
            registration: { displayName: 'Anjali Sharma', role: 'client', ageConfirmed: true },
        });
        expect(res.status).toBe(200);
        expect(mockUserCreate).toHaveBeenCalledWith(
            expect.objectContaining({
                displayName: 'Anjali Sharma',
                phoneNumber: '+919876543210',
                role: 'client',
                authProvider: 'phone',
                roleChangedAt: expect.any(Date),
                phoneVerifiedAt: expect.any(Date),
                ageConfirmedAt: expect.any(Date),
            }),
        );
        const decoded: any = jwt.verify(res.body.data.token, 'test-secret');
        expect(decoded.user.role).toBe('client');
        expect(res.body.data.created).toBe(true);
        expect(res.body.data.user.role).toBe('client');
    });

    it('rejects registration without ageConfirmed', async () => {
        mockSessionFindOne.mockReturnValue(chain(validSession()));
        mockUserFindOne.mockResolvedValue(null);
        const res = await request(app).post('/api/auth/verify-otp').send({
            phone: '+919876543210', otp: '123456',
            registration: { displayName: 'Anjali', role: 'client', ageConfirmed: false },
        });
        expect(res.status).toBe(400);
        expect(mockUserCreate).not.toHaveBeenCalled();
    });

    it('rejects registration with a non-client role', async () => {
        mockSessionFindOne.mockReturnValue(chain(validSession()));
        mockUserFindOne.mockResolvedValue(null);
        const res = await request(app).post('/api/auth/verify-otp').send({
            phone: '+919876543210', otp: '123456',
            registration: { displayName: 'X', role: 'creative_lead', ageConfirmed: true },
        });
        expect(res.status).toBe(400);
    });

    it('ignores registration payload when the phone already has an account (login wins)', async () => {
        mockSessionFindOne.mockReturnValue(chain(validSession()));
        mockUserFindOne.mockResolvedValue({
            id: 'u1', _id: 'u1', role: 'artist', displayName: 'Ravi',
            accountStatus: 'active', cached: {}, kycStatus: 'unverified',
            toObject() { return { _id: 'u1', role: 'artist', displayName: 'Ravi' }; },
            save: jest.fn(),
        });
        const res = await request(app).post('/api/auth/verify-otp').send({
            phone: '+919876543210', otp: '123456',
            registration: { displayName: 'New Name', role: 'client', ageConfirmed: true },
        });
        expect(res.status).toBe(200);
        expect(mockUserCreate).not.toHaveBeenCalled();
        const decoded: any = jwt.verify(res.body.data.token, 'test-secret');
        expect(decoded.user.role).toBe('artist');
    });

    it('rejects registration with empty-after-trim displayName', async () => {
        mockSessionFindOne.mockReturnValue(chain(validSession()));
        mockUserFindOne.mockResolvedValue(null);
        const res = await request(app).post('/api/auth/verify-otp').send({
            phone: '+919876543210', otp: '123456',
            registration: { displayName: '   ', role: 'client', ageConfirmed: true },
        });
        expect(res.status).toBe(400);
        expect(mockUserCreate).not.toHaveBeenCalled();
    });

    it('rejects registration with displayName exceeding 60 chars', async () => {
        mockSessionFindOne.mockReturnValue(chain(validSession()));
        mockUserFindOne.mockResolvedValue(null);
        const res = await request(app).post('/api/auth/verify-otp').send({
            phone: '+919876543210', otp: '123456',
            registration: { displayName: 'x'.repeat(61), role: 'client', ageConfirmed: true },
        });
        expect(res.status).toBe(400);
        expect(mockUserCreate).not.toHaveBeenCalled();
    });
});
