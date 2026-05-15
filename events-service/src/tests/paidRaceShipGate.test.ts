/**
 * Plan 8 Task 12 — SHIP GATE for paid event race correctness.
 *
 * Real Mongo + mocked Razorpay. Hammers POST /register and the webhook
 * endpoint concurrently, then verifies the capacity invariant + state machine
 * holds.
 */
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';

const JWT_SECRET = 'test_secret';
const WEBHOOK_SECRET = 'test_webhook_secret';

beforeAll(() => {
    process.env.JWT_SECRET = JWT_SECRET;
    process.env.RAZORPAY_WEBHOOK_SECRET = WEBHOOK_SECRET;
    process.env.RAZORPAY_KEY_ID = 'rzp_test_key';
});

function signWebhook(payload: string): string {
    return crypto.createHmac('sha256', WEBHOOK_SECRET).update(payload).digest('hex');
}

function tokenFor(userId: string): string {
    return jwt.sign({ user: { id: userId, role: 'artist' } }, JWT_SECRET, { expiresIn: '1h' });
}

describe('SHIP GATE — paid event race + webhook idempotency', () => {
    let mongo: MongoMemoryServer;
    let app: any;
    let Event: any;
    let EventRegistration: any;
    let createEventOrderMock: jest.Mock;
    let triggerRefundMock: jest.Mock;
    let publishNotificationMock: jest.Mock;

    beforeAll(async () => {
        jest.resetModules();

        // Mock razorpay.service: per-call unique order_id
        let orderCounter = 0;
        createEventOrderMock = jest.fn().mockImplementation(({ receiptKey }: any) => {
            orderCounter++;
            return Promise.resolve({
                id: `order_${orderCounter}_${Math.random().toString(36).slice(2, 8)}`,
                amount: 49900,
                currency: 'INR',
                receipt: receiptKey,
                status: 'created',
            });
        });
        triggerRefundMock = jest.fn();
        publishNotificationMock = jest.fn();

        jest.doMock('../services/razorpay.service', () => ({
            __esModule: true,
            createEventOrder: createEventOrderMock,
            fetchPayment: jest.fn(),
            triggerRefund: triggerRefundMock,
            buildRouteTransfer: jest.fn().mockReturnValue(undefined),
        }));
        jest.doMock('../services/notificationPublisher.service', () => ({
            __esModule: true,
            publishNotification: publishNotificationMock,
        }));

        // Spin up in-memory Mongo + re-require fresh module graph
        mongo = await MongoMemoryServer.create();
        const freshMongoose = require('mongoose');
        await freshMongoose.connect(mongo.getUri());

        app = require('../app').default;
        Event = require('../models/Event').default;
        EventRegistration = require('../models/EventRegistration').default;

        // Ensure indexes are built (partial unique index on eventId+userId)
        await EventRegistration.syncIndexes();
    }, 60_000);

    afterAll(async () => {
        const freshMongoose = require('mongoose');
        await freshMongoose.disconnect();
        await mongo.stop();
    });

    beforeEach(async () => {
        await Event.deleteMany({});
        await EventRegistration.deleteMany({});
        jest.clearAllMocks();
    });

    it('50 parallel registers → exactly 25 succeed; 25 captures all confirm; 10 duplicates noop; 5 fail releases seats; 5 new succeed', async () => {
        // ============================================================
        // Setup: create the event
        // ============================================================
        const organizerId = new mongoose.Types.ObjectId();
        const ev = await Event.create({
            organizerId,
            title: 'Ship Gate Concert',
            topicTags: ['audition'],
            registrationMode: 'paid_ticket',
            about: 'A'.repeat(150),
            startsAt: new Date(Date.now() + 48 * 3600_000),
            durationKind: 'h2',
            location: { kind: 'in_person', venueName: 'Studio X', address: 'Mumbai' },
            capacity: { total: 25, registeredCount: 0 },
            status: 'live',
            media: [{ kind: 'photo', url: 's3://x', width: 1, height: 1, isHero: true, sortOrder: 0 }],
            pricing: { amount: 499, currency: 'INR', refundPolicy: 'flex_24h' },
        });
        const eventId = (ev._id as any).toString();

        // ============================================================
        // STEP 1: 50 parallel registers
        // ============================================================
        const registerPromises = Array.from({ length: 50 }, (_, i) => {
            const userId = new mongoose.Types.ObjectId().toString();
            return request(app)
                .post(`/api/events/${eventId}/register`)
                .set('Authorization', `Bearer ${tokenFor(userId)}`)
                .send({
                    attendeeName: `User ${i + 1}`,
                    attendeePhone: '+919876543210',
                    attendeeCount: 1,
                });
        });

        const registerResults = await Promise.all(registerPromises);

        const succeeded = registerResults.filter((r) => r.status === 200);
        const failed = registerResults.filter((r) => r.status !== 200);

        expect(succeeded.length).toBe(25);
        expect(failed.length).toBe(25);
        // All failed should be 409 (capacity exhausted)
        expect(failed.every((r) => r.status === 409)).toBe(true);

        const evAfterReg = await Event.findById(eventId).lean();
        expect(evAfterReg.capacity.registeredCount).toBe(25);

        const pendingCount = await EventRegistration.countDocuments({
            eventId,
            status: 'pending_payment',
            paymentStatus: 'pending',
        });
        expect(pendingCount).toBe(25);

        // Collect order_ids from successful registrations
        const orderIds = succeeded.map((r: any) => r.body.data.order_id);
        expect(new Set(orderIds).size).toBe(25); // all unique

        // ============================================================
        // STEP 2: 25 payment.captured webhooks (in parallel)
        // ============================================================
        const capturePromises = orderIds.map((orderId, i) => {
            const payload = JSON.stringify({
                event: 'payment.captured',
                payload: {
                    payment: {
                        entity: {
                            id: `pay_capture_${i + 1}`,
                            order_id: orderId,
                            amount: 49900,
                            currency: 'INR',
                            status: 'captured',
                        },
                    },
                },
            });
            return request(app)
                .post('/api/events/razorpay/webhook')
                .set('X-Razorpay-Signature', signWebhook(payload))
                .set('Content-Type', 'application/json')
                .send(payload);
        });

        const captureResults = await Promise.all(capturePromises);
        expect(captureResults.every((r) => r.status === 200)).toBe(true);

        const confirmedAfterCapture = await EventRegistration.countDocuments({
            eventId,
            paymentStatus: 'completed',
            status: 'confirmed',
        });
        expect(confirmedAfterCapture).toBe(25);

        // ============================================================
        // STEP 3: 10 duplicate captures (Razorpay retry) — same payment, same order
        // ============================================================
        const dupOrderIds = orderIds.slice(0, 10);
        const dupPromises = dupOrderIds.map((orderId, i) => {
            const payload = JSON.stringify({
                event: 'payment.captured',
                payload: {
                    payment: {
                        entity: {
                            id: `pay_capture_${i + 1}`, // same as STEP 2
                            order_id: orderId,
                            amount: 49900,
                            currency: 'INR',
                            status: 'captured',
                        },
                    },
                },
            });
            return request(app)
                .post('/api/events/razorpay/webhook')
                .set('X-Razorpay-Signature', signWebhook(payload))
                .set('Content-Type', 'application/json')
                .send(payload);
        });

        const dupResults = await Promise.all(dupPromises);
        expect(dupResults.every((r) => r.status === 200)).toBe(true);

        // State unchanged — still 25 confirmed
        const stillConfirmed = await EventRegistration.countDocuments({
            eventId,
            paymentStatus: 'completed',
            status: 'confirmed',
        });
        expect(stillConfirmed).toBe(25);

        // ============================================================
        // STEP 4: 5 webhooks arrive as payment.failed → seats released
        // ============================================================
        const failOrderIds = orderIds.slice(20, 25); // the LAST 5 of the original 25
        // Note: we need to flip these BACK to paymentStatus=pending first because
        // they're now 'completed' (Step 2). In real Razorpay, the captured event
        // and the failed event would never both arrive for the same order. Here
        // we test the seat-release path of payment.failed, which requires the row
        // to be in pending state. Reset those 5 rows:
        await EventRegistration.updateMany(
            { eventId, razorpayOrderId: { $in: failOrderIds } },
            { paymentStatus: 'pending', status: 'pending_payment' }
        );

        const failPromises = failOrderIds.map((orderId, i) => {
            const payload = JSON.stringify({
                event: 'payment.failed',
                payload: {
                    payment: {
                        entity: {
                            id: `pay_fail_${i + 1}`,
                            order_id: orderId,
                            amount: 49900,
                            currency: 'INR',
                        },
                    },
                },
            });
            return request(app)
                .post('/api/events/razorpay/webhook')
                .set('X-Razorpay-Signature', signWebhook(payload))
                .set('Content-Type', 'application/json')
                .send(payload);
        });

        const failResults = await Promise.all(failPromises);
        expect(failResults.every((r) => r.status === 200)).toBe(true);

        const evAfterFail = await Event.findById(eventId).lean();
        expect(evAfterFail.capacity.registeredCount).toBe(20);

        const failedCount = await EventRegistration.countDocuments({
            eventId,
            paymentStatus: 'failed',
            status: 'cancelled',
        });
        expect(failedCount).toBe(5);

        // ============================================================
        // STEP 5: 5 new registers should succeed
        // ============================================================
        const newRegisters = Array.from({ length: 5 }, (_, i) => {
            const userId = new mongoose.Types.ObjectId().toString();
            return request(app)
                .post(`/api/events/${eventId}/register`)
                .set('Authorization', `Bearer ${tokenFor(userId)}`)
                .send({
                    attendeeName: `Replacement ${i + 1}`,
                    attendeePhone: '+919876543210',
                    attendeeCount: 1,
                });
        });

        const newResults = await Promise.all(newRegisters);
        expect(newResults.every((r) => r.status === 200)).toBe(true);

        // Final state:
        // 25 cap, 25 reserved = 20 original confirmed + 5 new pending_payment
        const evFinal = await Event.findById(eventId).lean();
        expect(evFinal.capacity.registeredCount).toBe(25);

        const confirmedFinal = await EventRegistration.countDocuments({
            eventId,
            paymentStatus: 'completed',
            status: 'confirmed',
        });
        expect(confirmedFinal).toBe(20);

        const pendingFinal = await EventRegistration.countDocuments({
            eventId,
            paymentStatus: 'pending',
            status: 'pending_payment',
        });
        expect(pendingFinal).toBe(5);

        const cancelledFinal = await EventRegistration.countDocuments({
            eventId,
            paymentStatus: 'failed',
            status: 'cancelled',
        });
        expect(cancelledFinal).toBe(5);

        const totalRows = await EventRegistration.countDocuments({ eventId });
        expect(totalRows).toBe(30); // 25 original + 5 new
    }, 60_000);
});
