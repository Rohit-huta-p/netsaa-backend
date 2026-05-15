import request from 'supertest';
import jwt from 'jsonwebtoken';

jest.mock('../models/Event');
jest.mock('../models/EventRegistration');
jest.mock('../models/User');
jest.mock('../services/capacity.service');
jest.mock('../services/notificationPublisher.service');
jest.mock('../services/razorpay.service');

import app from '../app';
import Event from '../models/Event';
import EventRegistration from '../models/EventRegistration';
import User from '../models/User';
import { reserveSpots, releaseSpots } from '../services/capacity.service';
import { publishNotification } from '../services/notificationPublisher.service';
import { createEventOrder } from '../services/razorpay.service';

const JWT_SECRET = 'test_secret';
const userId = '507f1f77bcf86cd799439020';
const eventId = '507f1f77bcf86cd799439011';
const organizerId = '507f1f77bcf86cd799439030';
const token = jwt.sign({ user: { id: userId, role: 'artist' } }, JWT_SECRET, { expiresIn: '1h' });

beforeAll(() => { process.env.JWT_SECRET = JWT_SECRET; });

beforeEach(() => {
    (User.findById as jest.Mock).mockReturnValue({
        select: jest.fn().mockResolvedValue({
            _id: userId,
            name: 'Anjali Ramesh',
            phone: '+919876543210',
            city: 'Mumbai',
            role: 'artist',
        }),
    });
});

// Valid register payload — multi-attendee schema (Plan 6 Task 22)
const validBody = {
    attendeeName: 'Anjali Ramesh',
    attendeePhone: '+919876543210',
    attendeeCount: 1,
};

describe('POST /api/events/:id/register', () => {
    it('401 without auth', async () => {
        const res = await request(app).post(`/api/events/${eventId}/register`);
        expect(res.status).toBe(401);
    });

    it('200 reserves spot + creates registration with default visibility=private', async () => {
        (Event.findById as jest.Mock).mockReturnValue({
            select: jest.fn().mockResolvedValue({
                _id: eventId,
                organizerId,
                status: 'live',
                startsAt: new Date(Date.now() + 86400_000),
            }),
        });
        (reserveSpots as jest.Mock).mockResolvedValue({ ok: true, event: { _id: eventId, capacity: { total: 50, registeredCount: 33 } } });
        (EventRegistration.create as jest.Mock).mockResolvedValue({
            _id: 'reg1',
            eventId,
            userId,
            status: 'confirmed',
            visibility: 'private',
        });
        (EventRegistration.countDocuments as jest.Mock).mockResolvedValue(1);

        const res = await request(app)
            .post(`/api/events/${eventId}/register`)
            .set('Authorization', `Bearer ${token}`)
            .send({ ...validBody, visibility: 'private' });

        expect(res.status).toBe(200);
        expect(EventRegistration.create).toHaveBeenCalledWith(expect.objectContaining({
            eventId,
            userId,
            status: 'confirmed',
            visibility: 'private',
            source: 'rsvp',
            contactSnapshot: expect.objectContaining({
                name: 'Anjali Ramesh',
                phone: '+919876543210',
                city: 'Mumbai',
            }),
        }));

        expect(publishNotification).toHaveBeenCalledWith(expect.objectContaining({
            subtype: 'event.first_registration_ever',
            eventId,
            organizerId,
        }));
    });

    it('409 when capacity full — does NOT call EventRegistration.create', async () => {
        (Event.findById as jest.Mock).mockReturnValue({
            select: jest.fn().mockResolvedValue({ _id: eventId, organizerId, status: 'live', startsAt: new Date(Date.now() + 86400_000) }),
        });
        (reserveSpots as jest.Mock).mockResolvedValue({ ok: false, reason: 'full_or_inactive' });

        const res = await request(app)
            .post(`/api/events/${eventId}/register`)
            .set('Authorization', `Bearer ${token}`)
            .send(validBody);

        expect(res.status).toBe(409);
        expect(EventRegistration.create).not.toHaveBeenCalled();
    });

    it('409 + compensation when insert fails with duplicate key', async () => {
        (Event.findById as jest.Mock).mockReturnValue({
            select: jest.fn().mockResolvedValue({ _id: eventId, organizerId, status: 'live', startsAt: new Date(Date.now() + 86400_000) }),
        });
        (reserveSpots as jest.Mock).mockResolvedValue({ ok: true, event: { _id: eventId } });
        const dupErr: any = new Error('dup');
        dupErr.code = 11000;
        (EventRegistration.create as jest.Mock).mockRejectedValue(dupErr);

        const res = await request(app)
            .post(`/api/events/${eventId}/register`)
            .set('Authorization', `Bearer ${token}`)
            .send(validBody);

        expect(res.status).toBe(409);
        expect(res.body.message).toMatch(/already.registered/i);
        expect(releaseSpots).toHaveBeenCalledWith(eventId, 1);
    });

    it('403 when artist tries to RSVP own event', async () => {
        (Event.findById as jest.Mock).mockReturnValue({
            select: jest.fn().mockResolvedValue({ _id: eventId, organizerId: userId, status: 'live', startsAt: new Date(Date.now() + 86400_000) }),
        });

        const res = await request(app)
            .post(`/api/events/${eventId}/register`)
            .set('Authorization', `Bearer ${token}`)
            .send(validBody);

        expect(res.status).toBe(403);
    });
});

describe('DELETE /api/events/:id/registrations/me', () => {
    it('200 cancels own registration + releases capacity', async () => {
        (EventRegistration.findOneAndUpdate as jest.Mock).mockResolvedValue({
            _id: 'reg1',
            eventId,
            userId,
            status: 'cancelled',
            attendeeCount: 1,
        });
        (releaseSpots as jest.Mock).mockResolvedValue(undefined);

        const res = await request(app)
            .delete(`/api/events/${eventId}/registrations/me`)
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(EventRegistration.findOneAndUpdate).toHaveBeenCalledWith(
            { eventId, userId, status: { $in: ['confirmed', 'pending_payment'] } },
            { status: 'cancelled', cancelledAt: expect.any(Date) },
            { new: true }
        );
        expect(releaseSpots).toHaveBeenCalledWith(eventId, 1);
    });

    it('404 when not currently registered', async () => {
        (EventRegistration.findOneAndUpdate as jest.Mock).mockResolvedValue(null);
        const res = await request(app)
            .delete(`/api/events/${eventId}/registrations/me`)
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(404);
        expect(releaseSpots).not.toHaveBeenCalled();
    });
});

describe('POST /api/events/:id/register — paid event', () => {
    beforeEach(() => jest.clearAllMocks());

    it('200 returns Razorpay order details when event is paid_ticket', async () => {
        (Event.findById as jest.Mock).mockReturnValue({
            select: jest.fn().mockResolvedValue({
                _id: eventId,
                organizerId,
                status: 'live',
                startsAt: new Date(Date.now() + 86400_000),
                title: 'Paid Workshop',
                registrationMode: 'paid_ticket',
                pricing: { amount: 499, currency: 'INR', refundPolicy: 'flex_24h' },
            }),
        });
        (reserveSpots as jest.Mock).mockResolvedValue({ ok: true, event: { _id: eventId } });
        (createEventOrder as jest.Mock).mockResolvedValue({
            id: 'order_test',
            amount: 49900,
            currency: 'INR',
        });
        (EventRegistration.create as jest.Mock).mockResolvedValue({ _id: 'reg1' });

        process.env.RAZORPAY_KEY_ID = 'rzp_test_key';

        const res = await request(app)
            .post(`/api/events/${eventId}/register`)
            .set('Authorization', `Bearer ${token}`)
            .send({
                attendeeName: 'Anjali',
                attendeePhone: '+919876543210',
                attendeeCount: 1,
            });

        expect(res.status).toBe(200);
        expect(res.body.data).toMatchObject({
            ok: true,
            paymentRequired: true,
            order_id: 'order_test',
            amount: 49900,
            currency: 'INR',
            key_id: 'rzp_test_key',
        });
        expect(EventRegistration.create).toHaveBeenCalledWith(
            expect.objectContaining({
                paymentStatus: 'pending',
                source: 'paid',
                razorpayOrderId: 'order_test',
                status: 'pending_payment',
            })
        );
    });

    it('500 + releaseSpots if Razorpay order creation fails', async () => {
        (Event.findById as jest.Mock).mockReturnValue({
            select: jest.fn().mockResolvedValue({
                _id: eventId,
                organizerId,
                status: 'live',
                startsAt: new Date(Date.now() + 86400_000),
                registrationMode: 'paid_ticket',
                pricing: { amount: 499, currency: 'INR' },
            }),
        });
        (reserveSpots as jest.Mock).mockResolvedValue({ ok: true, event: { _id: eventId } });
        (createEventOrder as jest.Mock).mockRejectedValue(new Error('Razorpay down'));

        const res = await request(app)
            .post(`/api/events/${eventId}/register`)
            .set('Authorization', `Bearer ${token}`)
            .send({ attendeeName: 'AB', attendeePhone: '+919876543210', attendeeCount: 1 });

        expect(res.status).toBe(500);
        expect(releaseSpots).toHaveBeenCalledWith(eventId, 1);
        expect(EventRegistration.create).not.toHaveBeenCalled();
    });

    it('200 for free_rsvp event does NOT call createEventOrder', async () => {
        (Event.findById as jest.Mock).mockReturnValue({
            select: jest.fn().mockResolvedValue({
                _id: eventId,
                organizerId,
                status: 'live',
                startsAt: new Date(Date.now() + 86400_000),
                registrationMode: 'free_rsvp',
            }),
        });
        (reserveSpots as jest.Mock).mockResolvedValue({ ok: true, event: { _id: eventId } });
        (EventRegistration.create as jest.Mock).mockResolvedValue({});
        (EventRegistration.countDocuments as jest.Mock).mockResolvedValue(1);

        const res = await request(app)
            .post(`/api/events/${eventId}/register`)
            .set('Authorization', `Bearer ${token}`)
            .send({ attendeeName: 'AB', attendeePhone: '+919876543210', attendeeCount: 1 });

        expect(res.status).toBe(200);
        expect(createEventOrder).not.toHaveBeenCalled();
    });
});
