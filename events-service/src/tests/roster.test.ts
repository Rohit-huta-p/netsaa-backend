import request from 'supertest';
import jwt from 'jsonwebtoken';

jest.mock('../models/Event');
jest.mock('../models/EventRegistration');

import app from '../app';
import Event from '../models/Event';
import EventRegistration from '../models/EventRegistration';

const JWT_SECRET = 'test_secret';
const organizerId = '507f1f77bcf86cd799439030';
const otherUserId = '507f1f77bcf86cd799439020';
const eventId = '507f1f77bcf86cd799439011';

const organizerToken = jwt.sign({ user: { id: organizerId, role: 'hirer' } }, JWT_SECRET, { expiresIn: '1h' });
const otherToken = jwt.sign({ user: { id: otherUserId, role: 'artist' } }, JWT_SECRET, { expiresIn: '1h' });

beforeAll(() => { process.env.JWT_SECRET = JWT_SECRET; });

describe('GET /api/events/:id/roster', () => {
    it('401 without auth', async () => {
        const res = await request(app).get(`/api/events/${eventId}/roster`);
        expect(res.status).toBe(401);
    });

    it('403 when caller is not organizer', async () => {
        (Event.findById as jest.Mock).mockReturnValue({
            select: jest.fn().mockReturnValue({
                lean: jest.fn().mockResolvedValue({ _id: eventId, organizerId }),
            }),
        });

        const res = await request(app)
            .get(`/api/events/${eventId}/roster`)
            .set('Authorization', `Bearer ${otherToken}`);

        expect(res.status).toBe(403);
    });

    it('404 when event does not exist', async () => {
        (Event.findById as jest.Mock).mockReturnValue({
            select: jest.fn().mockReturnValue({
                lean: jest.fn().mockResolvedValue(null),
            }),
        });

        const res = await request(app)
            .get(`/api/events/${eventId}/roster`)
            .set('Authorization', `Bearer ${organizerToken}`);

        expect(res.status).toBe(404);
    });

    it('200 returns paginated rows for organizer', async () => {
        (Event.findById as jest.Mock).mockReturnValue({
            select: jest.fn().mockReturnValue({
                lean: jest.fn().mockResolvedValue({ _id: eventId, organizerId }),
            }),
        });

        const sortMock = jest.fn().mockReturnValue({
            skip: jest.fn().mockReturnValue({
                limit: jest.fn().mockReturnValue({
                    lean: jest.fn().mockResolvedValue([
                        { _id: 'r1', userId: 'u1', status: 'confirmed', visibility: 'private', contactSnapshot: { name: 'A', city: 'Mumbai' }, registeredAt: new Date() },
                        { _id: 'r2', userId: 'u2', status: 'confirmed', visibility: 'public', contactSnapshot: { name: 'B', city: 'Pune', phone: '+919876543210' }, registeredAt: new Date() },
                    ]),
                }),
            }),
        });
        (EventRegistration.find as jest.Mock).mockReturnValue({ sort: sortMock });
        (EventRegistration.countDocuments as jest.Mock).mockResolvedValue(2);

        const res = await request(app)
            .get(`/api/events/${eventId}/roster`)
            .set('Authorization', `Bearer ${organizerToken}`);

        expect(res.status).toBe(200);
        expect(res.body.data.rows).toHaveLength(2);
        expect(res.body.data.total).toBe(2);
        // Phone stripped at roster time (DPDP — shared only at hire-confirm)
        expect(res.body.data.rows[1].contactSnapshot.phone).toBeUndefined();
    });
});

describe('GET /api/events/:id/registrations/me', () => {
    it('401 without auth', async () => {
        const res = await request(app).get(`/api/events/${eventId}/registrations/me`);
        expect(res.status).toBe(401);
    });

    it('404 when caller not registered', async () => {
        (EventRegistration.findOne as jest.Mock).mockReturnValue({
            lean: jest.fn().mockResolvedValue(null),
        });

        const res = await request(app)
            .get(`/api/events/${eventId}/registrations/me`)
            .set('Authorization', `Bearer ${otherToken}`);

        expect(res.status).toBe(404);
    });

    it('200 returns own registration row', async () => {
        (EventRegistration.findOne as jest.Mock).mockReturnValue({
            lean: jest.fn().mockResolvedValue({
                _id: 'r1',
                eventId,
                userId: otherUserId,
                status: 'confirmed',
                visibility: 'private',
            }),
        });

        const res = await request(app)
            .get(`/api/events/${eventId}/registrations/me`)
            .set('Authorization', `Bearer ${otherToken}`);

        expect(res.status).toBe(200);
        expect(res.body.data.status).toBe('confirmed');
        expect(res.body.data.visibility).toBe('private');
    });
});
