import request from 'supertest';
import jwt from 'jsonwebtoken';

jest.mock('../models/Event');
jest.mock('../models/EventRegistration');
jest.mock('../models/EventAuditLog');

import app from '../app';
import Event from '../models/Event';
import EventRegistration from '../models/EventRegistration';
import EventAuditLog from '../models/EventAuditLog';

const JWT_SECRET = 'test_secret';
const organizerId = '507f1f77bcf86cd799439030';
const eventId = '507f1f77bcf86cd799439011';
const token = jwt.sign({ user: { id: organizerId, role: 'hirer' } }, JWT_SECRET, { expiresIn: '1h' });

beforeAll(() => { process.env.JWT_SECRET = JWT_SECRET; });

beforeEach(() => {
    (Event.findById as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnValue({
            lean: jest.fn().mockResolvedValue({ _id: eventId, organizerId, title: 'Test Audition' }),
        }),
    });
});

describe('GET /api/events/:id/roster.csv', () => {
    it('200 returns text/csv with DPDP header + audit log row', async () => {
        (EventRegistration.find as jest.Mock).mockReturnValue({
            sort: jest.fn().mockReturnValue({
                lean: jest.fn().mockResolvedValue([
                    { _id: 'r1', userId: 'u1', status: 'confirmed', visibility: 'private', contactSnapshot: { name: 'Anjali R', city: 'Mumbai' }, registeredAt: new Date('2026-05-10T10:00:00Z') },
                ]),
            }),
        });
        (EventAuditLog.create as jest.Mock).mockResolvedValue({ _id: 'aud1' });
        (EventAuditLog.countDocuments as jest.Mock).mockResolvedValue(0);

        const res = await request(app)
            .get(`/api/events/${eventId}/roster.csv`)
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toMatch(/text\/csv/);
        expect(res.text).toMatch(/DPDP/);
        expect(res.text).toMatch(/Anjali R/);
        expect(res.text).not.toMatch(/\+91/); // phone never in CSV
        expect(EventAuditLog.create).toHaveBeenCalledWith(expect.objectContaining({
            actorId: organizerId,
            action: 'csv_export',
            resourceType: 'event',
            resourceId: eventId,
        }));
    });

    it('403 when caller is not organizer', async () => {
        const otherToken = jwt.sign({ user: { id: 'other', role: 'artist' } }, JWT_SECRET, { expiresIn: '1h' });
        const res = await request(app)
            .get(`/api/events/${eventId}/roster.csv`)
            .set('Authorization', `Bearer ${otherToken}`);
        expect(res.status).toBe(403);
    });

    it('429 when rate limit exceeded (5/day)', async () => {
        (EventAuditLog.countDocuments as jest.Mock).mockResolvedValue(5);
        (EventRegistration.find as jest.Mock).mockReturnValue({
            sort: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }),
        });

        const res = await request(app)
            .get(`/api/events/${eventId}/roster.csv`)
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(429);
        expect(res.body.message).toMatch(/limit/i);
    });
});
