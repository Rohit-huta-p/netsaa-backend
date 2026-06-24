import request from 'supertest';

const mockFindByIdAndUpdate = jest.fn();
jest.mock('../models/User', () => ({
    __esModule: true,
    default: { findByIdAndUpdate: (...args: any[]) => mockFindByIdAndUpdate(...args) },
}));
jest.mock('../middleware/auth', () => ({
    protect: (req: any, _res: any, next: any) => {
        req.user = { _id: 'u1', id: 'u1' };
        next();
    },
}));

process.env.JWT_SECRET = 'test-secret';

import app from '../app';
import jwt from 'jsonwebtoken';

describe('POST /api/users/me/role', () => {
    beforeEach(() => mockFindByIdAndUpdate.mockReset());

    it('rejects an invalid role', async () => {
        const res = await request(app).post('/api/users/me/role').send({ role: 'superstar' });
        expect(res.status).toBe(400);
        expect(mockFindByIdAndUpdate).not.toHaveBeenCalled();
    });

    it('rejects a missing role', async () => {
        const res = await request(app).post('/api/users/me/role').send({});
        expect(res.status).toBe(400);
    });

    it('switches role, stamps roleChangedAt, returns fresh token + user', async () => {
        mockFindByIdAndUpdate.mockResolvedValue({
            _id: 'u1',
            id: 'u1',
            role: 'creative_lead',
            displayName: 'Rohit',
            email: 'r@x.com',
            profileImageUrl: '',
            cached: {},
            kycStatus: 'unverified',
            toObject() {
                return { _id: 'u1', role: 'creative_lead', displayName: 'Rohit', email: 'r@x.com' };
            },
        });

        const res = await request(app).post('/api/users/me/role').send({ role: 'creative_lead' });

        expect(res.status).toBe(200);
        expect(mockFindByIdAndUpdate).toHaveBeenCalledWith(
            'u1',
            expect.objectContaining({
                $set: expect.objectContaining({
                    role: 'creative_lead',
                    roleChangedAt: expect.any(Date),
                }),
            }),
            expect.objectContaining({ new: true }),
        );

        const decoded: any = jwt.verify(res.body.data.token, 'test-secret');
        expect(decoded.user.role).toBe('creative_lead');
        expect(res.body.data.user.role).toBe('creative_lead');
        expect(res.body.data.user.passwordHash).toBeUndefined();
    });

    it('404s when the user does not exist', async () => {
        mockFindByIdAndUpdate.mockResolvedValue(null);
        const res = await request(app).post('/api/users/me/role').send({ role: 'artist' });
        expect(res.status).toBe(404);
    });
});
