import request from 'supertest';
import jwt from 'jsonwebtoken';
import axios from 'axios';

jest.mock('../models/Event');
jest.mock('../models/EventRegistration');
jest.mock('axios');

import app from '../app';
import Event from '../models/Event';
import EventRegistration from '../models/EventRegistration';

const JWT_SECRET = 'test_secret';
const organizerId = '507f1f77bcf86cd799439030';
const eventId = '507f1f77bcf86cd799439011';
const token = jwt.sign({ user: { id: organizerId, role: 'hirer' } }, JWT_SECRET, { expiresIn: '1h' });

beforeAll(() => { process.env.JWT_SECRET = JWT_SECRET; });

describe('GET /api/events/:id/funnel-metrics', () => {
    beforeEach(() => {
        (Event.findById as jest.Mock).mockReturnValue({
            select: jest.fn().mockReturnValue({
                lean: jest.fn().mockResolvedValue({ _id: eventId, organizerId }),
            }),
        });
        (EventRegistration.countDocuments as jest.Mock).mockResolvedValue(50);
    });

    it('200 returns gig-application-source aggregation for organizer', async () => {
        (axios.get as jest.Mock).mockResolvedValue({
            data: { data: { count: 17 } },
        });

        const res = await request(app)
            .get(`/api/events/${eventId}/funnel-metrics`)
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(res.body.data.gigApplicationsFromEvent).toBe(17);
    });

    it('403 when caller is not organizer', async () => {
        const otherToken = jwt.sign({ user: { id: 'other', role: 'artist' } }, JWT_SECRET, { expiresIn: '1h' });
        const res = await request(app)
            .get(`/api/events/${eventId}/funnel-metrics`)
            .set('Authorization', `Bearer ${otherToken}`);
        expect(res.status).toBe(403);
    });
});
