import request from 'supertest';
import crypto from 'crypto';

jest.mock('../models/EventRegistration');
jest.mock('../services/capacity.service');
jest.mock('../services/notificationPublisher.service');

import app from '../app';
import EventRegistration from '../models/EventRegistration';
import { releaseSpots } from '../services/capacity.service';
import { publishNotification } from '../services/notificationPublisher.service';

const SECRET = 'test_webhook_secret';
beforeAll(() => { process.env.RAZORPAY_WEBHOOK_SECRET = SECRET; });

function sign(payload: string): string {
    return crypto.createHmac('sha256', SECRET).update(payload).digest('hex');
}

describe('POST /api/events/razorpay/webhook', () => {
    beforeEach(() => jest.clearAllMocks());

    it('400 when signature header missing', async () => {
        const res = await request(app)
            .post('/api/events/razorpay/webhook')
            .send({});
        expect(res.status).toBe(400);
    });

    it('401 when signature is wrong', async () => {
        const res = await request(app)
            .post('/api/events/razorpay/webhook')
            .set('X-Razorpay-Signature', 'wrong_sig')
            .set('Content-Type', 'application/json')
            .send({ event: 'payment.captured' });
        expect(res.status).toBe(401);
    });

    it('200 + flips paymentStatus on payment.captured', async () => {
        (EventRegistration.findOneAndUpdate as jest.Mock).mockResolvedValue({
            _id: 'r1',
            eventId: 'evt1',
            userId: 'u1',
            attendeeName: 'Anjali',
            paymentStatus: 'completed',
        });

        const payload = JSON.stringify({
            event: 'payment.captured',
            payload: {
                payment: {
                    entity: {
                        id: 'pay_abc',
                        order_id: 'order_xyz',
                        amount: 49900,
                        currency: 'INR',
                        status: 'captured',
                    },
                },
            },
        });

        const res = await request(app)
            .post('/api/events/razorpay/webhook')
            .set('X-Razorpay-Signature', sign(payload))
            .set('Content-Type', 'application/json')
            .send(payload);

        expect(res.status).toBe(200);
        expect(EventRegistration.findOneAndUpdate).toHaveBeenCalledWith(
            { razorpayOrderId: 'order_xyz' },
            expect.objectContaining({
                paymentStatus: 'completed',
                status: 'confirmed',
                razorpayPaymentId: 'pay_abc',
                paidAmount: 499,
            }),
            { new: true }
        );
        expect(publishNotification).toHaveBeenCalledWith(
            expect.objectContaining({ subtype: 'event.payment_captured' })
        );
    });

    it('200 + releaseSpots on payment.failed', async () => {
        (EventRegistration.findOneAndUpdate as jest.Mock).mockResolvedValue({
            _id: 'r2',
            eventId: 'evt1',
            attendeeCount: 2,
            paymentStatus: 'failed',
        });

        const payload = JSON.stringify({
            event: 'payment.failed',
            payload: {
                payment: { entity: { id: 'pay_fail', order_id: 'order_fail', amount: 99800, currency: 'INR' } },
            },
        });

        const res = await request(app)
            .post('/api/events/razorpay/webhook')
            .set('X-Razorpay-Signature', sign(payload))
            .set('Content-Type', 'application/json')
            .send(payload);

        expect(res.status).toBe(200);
        expect(releaseSpots).toHaveBeenCalledWith('evt1', 2);
    });

    it('200 on refund.processed flips paymentStatus to refunded', async () => {
        (EventRegistration.findOneAndUpdate as jest.Mock).mockResolvedValue({});
        const payload = JSON.stringify({
            event: 'refund.processed',
            payload: { refund: { entity: { id: 'rfnd_x', payment_id: 'pay_abc', amount: 49900 } } },
        });
        const res = await request(app)
            .post('/api/events/razorpay/webhook')
            .set('X-Razorpay-Signature', sign(payload))
            .set('Content-Type', 'application/json')
            .send(payload);
        expect(res.status).toBe(200);
        expect(EventRegistration.findOneAndUpdate).toHaveBeenCalledWith(
            { razorpayPaymentId: 'pay_abc' },
            expect.objectContaining({ paymentStatus: 'refunded', refundedAt: expect.any(Date) }),
            { new: true }
        );
    });

    it('200 ignores unknown event types gracefully', async () => {
        const payload = JSON.stringify({ event: 'order.notified', payload: {} });
        const res = await request(app)
            .post('/api/events/razorpay/webhook')
            .set('X-Razorpay-Signature', sign(payload))
            .set('Content-Type', 'application/json')
            .send(payload);
        expect(res.status).toBe(200);
        expect(EventRegistration.findOneAndUpdate).not.toHaveBeenCalled();
    });
});
