import request from 'supertest';
import jwt from 'jsonwebtoken';

jest.mock('../models/Event');
jest.mock('../models/EventRegistration');
jest.mock('../services/notificationPublisher.service');
jest.mock('../services/auditLog.service');

import app from '../app';
import Event from '../models/Event';
import EventRegistration from '../models/EventRegistration';
import { publishNotification } from '../services/notificationPublisher.service';
import { recordAudit } from '../services/auditLog.service';

const JWT_SECRET = 'test_secret';
const organizerId = '507f1f77bcf86cd799439030';
const eventId = '507f1f77bcf86cd799439011';
const token = jwt.sign({ user: { id: organizerId, role: 'hirer' } }, JWT_SECRET, { expiresIn: '1h' });

beforeAll(() => { process.env.JWT_SECRET = JWT_SECRET; });

beforeEach(() => {
    (Event.findById as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnValue({
            lean: jest.fn().mockResolvedValue({ _id: eventId, organizerId, status: 'live', title: 'Audition' }),
        }),
    });
});

describe('POST /api/events/:id/cancel', () => {
    it('200 cancels and fires fanout', async () => {
        (Event.findByIdAndUpdate as jest.Mock).mockResolvedValue({ _id: eventId, status: 'cancelled' });
        (EventRegistration.find as jest.Mock).mockReturnValue({
            select: jest.fn().mockReturnValue({
                lean: jest.fn().mockResolvedValue([
                    { _id: 'r1', userId: 'u1' },
                    { _id: 'r2', userId: 'u2' },
                ]),
            }),
        });

        const res = await request(app)
            .post(`/api/events/${eventId}/cancel`)
            .set('Authorization', `Bearer ${token}`)
            .send({ reason: 'venue_unavailable', note: 'Studio flooded' });

        expect(res.status).toBe(200);
        expect(Event.findByIdAndUpdate).toHaveBeenCalledWith(eventId, expect.objectContaining({
            status: 'cancelled',
            cancelledAt: expect.any(Date),
            cancelReason: 'venue_unavailable',
            cancelNote: 'Studio flooded',
        }));
        expect(publishNotification).toHaveBeenCalledTimes(2);
        expect(publishNotification).toHaveBeenCalledWith(expect.objectContaining({
            subtype: 'event.cancelled',
            userId: 'u1',
        }));
        expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({
            action: 'event_cancel',
        }));
    });

    it('403 for non-organizer', async () => {
        const otherToken = jwt.sign({ user: { id: 'other', role: 'artist' } }, JWT_SECRET, { expiresIn: '1h' });
        const res = await request(app)
            .post(`/api/events/${eventId}/cancel`)
            .set('Authorization', `Bearer ${otherToken}`)
            .send({});
        expect(res.status).toBe(403);
    });

    it('409 if event already cancelled', async () => {
        (Event.findById as jest.Mock).mockReturnValue({
            select: jest.fn().mockReturnValue({
                lean: jest.fn().mockResolvedValue({ _id: eventId, organizerId, status: 'cancelled' }),
            }),
        });
        const res = await request(app)
            .post(`/api/events/${eventId}/cancel`)
            .set('Authorization', `Bearer ${token}`)
            .send({});
        expect(res.status).toBe(409);
    });
});

describe('POST /api/events/:id/reschedule', () => {
    it('200 updates startsAt + records rescheduledFromAt', async () => {
        (Event.findByIdAndUpdate as jest.Mock).mockResolvedValue({ _id: eventId, startsAt: new Date('2026-06-01T10:00:00Z') });
        (EventRegistration.find as jest.Mock).mockReturnValue({
            select: jest.fn().mockReturnValue({
                lean: jest.fn().mockResolvedValue([{ _id: 'r1', userId: 'u1' }]),
            }),
        });

        const newStart = new Date('2026-06-15T10:00:00Z').toISOString();
        const res = await request(app)
            .post(`/api/events/${eventId}/reschedule`)
            .set('Authorization', `Bearer ${token}`)
            .send({ newStartsAt: newStart });

        expect(res.status).toBe(200);
        expect(Event.findByIdAndUpdate).toHaveBeenCalledWith(eventId, expect.objectContaining({
            startsAt: new Date(newStart),
            rescheduledFromAt: expect.any(Date),
            rescheduleNoticeAt: expect.any(Date),
        }));
    });

    it('400 if newStartsAt is in past', async () => {
        const res = await request(app)
            .post(`/api/events/${eventId}/reschedule`)
            .set('Authorization', `Bearer ${token}`)
            .send({ newStartsAt: new Date(Date.now() - 86400_000).toISOString() });
        expect(res.status).toBe(400);
    });
});
