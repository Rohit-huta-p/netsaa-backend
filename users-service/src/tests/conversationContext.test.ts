// src/tests/conversationContext.test.ts
import request from 'supertest';

const mockConvFindOne = jest.fn();
const mockConvCreate = jest.fn();
const mockMsgCreate = jest.fn();

jest.mock('../connections/conversations.model', () => ({
    __esModule: true,
    default: {
        findOne: (...a: any[]) => mockConvFindOne(...a),
        create: (...a: any[]) => mockConvCreate(...a),
    },
}));
jest.mock('../connections/messages.model', () => ({
    __esModule: true,
    default: { create: (...a: any[]) => mockMsgCreate(...a) },
}));
jest.mock('../middleware/auth', () => ({
    protect: (req: any, _res: any, next: any) => { req.user = { _id: 'c1', id: 'c1' }; next(); },
}));
jest.mock('../config/db', () => jest.fn());
process.env.JWT_SECRET = 'test-secret';
process.env.ENABLE_SOCKET_REDIS = 'false';
jest.mock('../email/email.queue', () => ({ __esModule: true, emailQueue: { add: jest.fn() } }));

import app from '../app';

describe('POST /api/conversations with context', () => {
    beforeEach(() => [mockConvFindOne, mockConvCreate, mockMsgCreate].forEach((m) => m.mockReset()));

    it('creates an anchored conversation + a system seed message', async () => {
        mockConvFindOne.mockResolvedValue(null);
        const created: any = {
            _id: 'conv1',
            participants: ['c1', 'cl1'],
            lastMessage: undefined,
            lastMessageAt: undefined,
            save: jest.fn().mockResolvedValue(undefined),
            populate: jest.fn().mockResolvedValue({ _id: 'conv1', participants: ['c1', 'cl1'] }),
        };
        mockConvCreate.mockResolvedValue(created);
        mockMsgCreate.mockResolvedValue({ _id: 'm1', system: true });

        const res = await request(app).post('/api/conversations').send({
            recipientId: 'cl1',
            context: { requirementId: 'r1', proposalId: 'p1', label: 'Sangeet choreographer' },
            seedText: "You chose Priya's proposal · arrange the details",
        });
        expect([200, 201]).toContain(res.status);
        expect(mockConvCreate).toHaveBeenCalledWith(expect.objectContaining({
            participants: expect.arrayContaining(['c1', 'cl1']),
            context: expect.objectContaining({ requirementId: 'r1', proposalId: 'p1', label: 'Sangeet choreographer' }),
        }));
        expect(mockMsgCreate).toHaveBeenCalledWith(expect.objectContaining({ system: true, text: expect.any(String) }));
    });

    it('still works without context (plain DM, no seed)', async () => {
        mockConvFindOne.mockResolvedValue(null);
        const created: any = {
            _id: 'conv2',
            save: jest.fn().mockResolvedValue(undefined),
            populate: jest.fn().mockResolvedValue({ _id: 'conv2' }),
        };
        mockConvCreate.mockResolvedValue(created);
        const res = await request(app).post('/api/conversations').send({ recipientId: 'cl1' });
        expect([200, 201]).toContain(res.status);
        expect(mockMsgCreate).not.toHaveBeenCalled();
    });
});
