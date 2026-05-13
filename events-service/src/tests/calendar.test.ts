import request from 'supertest';
import jwt from 'jsonwebtoken';

jest.mock('../models/Event');
jest.mock('../models/EventRegistration');

import app from '../app';
import Event from '../models/Event';
import EventRegistration from '../models/EventRegistration';

const JWT_SECRET = 'test_secret';
const userId = '507f1f77bcf86cd799439020';
const eventId = '507f1f77bcf86cd799439011';
const token = jwt.sign({ user: { id: userId, role: 'artist' } }, JWT_SECRET, { expiresIn: '1h' });

beforeAll(() => {
    process.env.JWT_SECRET = JWT_SECRET;
    process.env.LINK_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
});

describe('GET /api/events/:id/calendar.ics', () => {
    it('200 returns ics for registrant of in-person event', async () => {
        (Event.findById as jest.Mock).mockReturnValue({
            lean: jest.fn().mockResolvedValue({
                _id: eventId,
                title: 'Audition',
                about: 'Open call',
                startsAt: new Date('2026-06-01T10:00:00Z'),
                endsAt: new Date('2026-06-01T14:00:00Z'),
                location: { kind: 'in_person', venueName: 'Studio X', address: 'Mumbai' },
                organizerId: 'org1',
                status: 'live',
            }),
        });
        (EventRegistration.findOne as jest.Mock).mockReturnValue({
            lean: jest.fn().mockResolvedValue({
                _id: 'r1',
                userId,
                eventId,
                status: 'confirmed',
            }),
        });

        const res = await request(app)
            .get(`/api/events/${eventId}/calendar.ics`)
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toMatch(/text\/calendar/);
        expect(res.text).toMatch(/BEGIN:VCALENDAR/);
        expect(res.text).toMatch(/Studio X/);
        expect(res.text).toMatch(/END:VCALENDAR/);
    });

    it('403 when caller is not registered + not organizer', async () => {
        (Event.findById as jest.Mock).mockReturnValue({
            lean: jest.fn().mockResolvedValue({
                _id: eventId,
                title: 'X',
                startsAt: new Date(),
                location: { kind: 'in_person' },
                organizerId: 'org1',
                status: 'live',
            }),
        });
        (EventRegistration.findOne as jest.Mock).mockReturnValue({
            lean: jest.fn().mockResolvedValue(null),
        });

        const res = await request(app)
            .get(`/api/events/${eventId}/calendar.ics`)
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(403);
    });
});
