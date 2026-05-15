import request from 'supertest';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';

jest.mock('../models/Event');
jest.mock('../models/EventRegistration');
jest.mock('../models/User');
jest.mock('../services/capacity.service');
jest.mock('../services/razorpay.service');
jest.mock('../services/notificationPublisher.service');

import app from '../app';
import Event from '../models/Event';
import EventRegistration from '../models/EventRegistration';
import User from '../models/User';
import { reserveSpots, releaseSpots } from '../services/capacity.service';
import { createEventOrder } from '../services/razorpay.service';
import { publishNotification } from '../services/notificationPublisher.service';

const JWT_SECRET = 'test_secret';
const WEBHOOK_SECRET = 'test_webhook_secret';
const userId = '507f1f77bcf86cd799439020';
const eventId = '507f1f77bcf86cd799439011';
const token = jwt.sign({ user: { id: userId, role: 'artist' } }, JWT_SECRET, { expiresIn: '1h' });

beforeAll(() => {
    process.env.JWT_SECRET = JWT_SECRET;
    process.env.RAZORPAY_WEBHOOK_SECRET = WEBHOOK_SECRET;
    process.env.RAZORPAY_KEY_ID = 'rzp_test_key';
});

function signWebhook(payload: string): string {
    return crypto.createHmac('sha256', WEBHOOK_SECRET).update(payload).digest('hex');
}

describe('paid event end-to-end (register → webhook capture)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (User.findById as jest.Mock).mockReturnValue({
            select: jest.fn().mockResolvedValue({
                _id: userId,
                name: 'AB',
                phone: '+919876543210',
                city: 'Mumbai',
                role: 'artist',
            }),
        });
    });

    it('register creates order; webhook captures + flips to confirmed', async () => {
        // Step 1: register
        (Event.findById as jest.Mock).mockReturnValue({
            select: jest.fn().mockResolvedValue({
                _id: eventId,
                organizerId: 'org1',
                status: 'live',
                startsAt: new Date(Date.now() + 86400_000),
                registrationMode: 'paid_ticket',
                pricing: { amount: 499, currency: 'INR', refundPolicy: 'flex_24h' },
                title: 'Workshop',
            }),
        });
        (reserveSpots as jest.Mock).mockResolvedValue({ ok: true, event: { _id: eventId } });
        (createEventOrder as jest.Mock).mockResolvedValue({ id: 'order_xyz', amount: 49900, currency: 'INR' });
        (EventRegistration.create as jest.Mock).mockResolvedValue({ _id: 'reg1' });

        const r1 = await request(app)
            .post(`/api/events/${eventId}/register`)
            .set('Authorization', `Bearer ${token}`)
            .send({ attendeeName: 'AB', attendeePhone: '+919876543210', attendeeCount: 1 });

        expect(r1.status).toBe(200);
        expect(r1.body.data.order_id).toBe('order_xyz');
        expect(r1.body.data.amount).toBe(49900);
        expect(r1.body.data.paymentRequired).toBe(true);

        // Step 2: webhook captures
        (EventRegistration.findOneAndUpdate as jest.Mock).mockResolvedValue({
            _id: 'reg1',
            eventId,
            userId,
            attendeeName: 'AB',
        });

        const webhookPayload = JSON.stringify({
            event: 'payment.captured',
            payload: {
                payment: {
                    entity: { id: 'pay_done', order_id: 'order_xyz', amount: 49900, currency: 'INR', status: 'captured' },
                },
            },
        });

        const r2 = await request(app)
            .post('/api/events/razorpay/webhook')
            .set('X-Razorpay-Signature', signWebhook(webhookPayload))
            .set('Content-Type', 'application/json')
            .send(webhookPayload);

        expect(r2.status).toBe(200);
        expect(EventRegistration.findOneAndUpdate).toHaveBeenCalledWith(
            { razorpayOrderId: 'order_xyz' },
            expect.objectContaining({ paymentStatus: 'completed', status: 'confirmed' }),
            { new: true }
        );
        expect(publishNotification).toHaveBeenCalledWith(
            expect.objectContaining({ subtype: 'event.payment_captured' })
        );
    });

    it('failed payment releases seats + flips to cancelled', async () => {
        (EventRegistration.findOneAndUpdate as jest.Mock).mockResolvedValue({
            _id: 'reg2',
            eventId,
            attendeeCount: 2,
        });

        const payload = JSON.stringify({
            event: 'payment.failed',
            payload: { payment: { entity: { id: 'pay_fail', order_id: 'order_fail', amount: 99800, currency: 'INR' } } },
        });

        await request(app)
            .post('/api/events/razorpay/webhook')
            .set('X-Razorpay-Signature', signWebhook(payload))
            .set('Content-Type', 'application/json')
            .send(payload);

        expect(releaseSpots).toHaveBeenCalledWith(eventId, 2);
    });
});
