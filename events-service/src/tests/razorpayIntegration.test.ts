/**
 * Plan 8 Task 11 — integration tests for Razorpay edge cases.
 *
 * Two describe blocks:
 *   - Mocked: state-machine idempotency, polling, stale cron window (fast)
 *   - Real Mongo: refund end-to-end, multi-attendee compensation, orphan webhook
 *
 * Layout note: we deliberately avoid module-scope `jest.mock()` because the
 * two blocks need DIFFERENT module graphs (one with mocked models, one with
 * real models against MongoMemoryServer). Each block sets up its own graph
 * via jest.resetModules() + jest.doMock(...) + re-require('../app').
 */

import request from 'supertest';
import crypto from 'crypto';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import jwt from 'jsonwebtoken';

const JWT_SECRET = 'test_secret';
const WEBHOOK_SECRET = 'test_webhook_secret';
const userId = '507f1f77bcf86cd799439020';
const eventIdFixed = '507f1f77bcf86cd799439011';
const token = jwt.sign({ user: { id: userId, role: 'artist' } }, JWT_SECRET, { expiresIn: '1h' });

beforeAll(() => {
    process.env.JWT_SECRET = JWT_SECRET;
    process.env.RAZORPAY_WEBHOOK_SECRET = WEBHOOK_SECRET;
    process.env.RAZORPAY_KEY_ID = 'rzp_test_key';
});

function signWebhook(payload: string): string {
    return crypto.createHmac('sha256', WEBHOOK_SECRET).update(payload).digest('hex');
}

// =========================================================================
// MOCKED INTEGRATION TESTS — state machine + polling timing
// =========================================================================
describe('Razorpay state machine — mocked integration', () => {
    let app: any;
    let EventRegistration: any;
    let capacityService: any;

    beforeAll(() => {
        jest.resetModules();
        jest.doMock('../models/EventRegistration');
        jest.doMock('../models/User');
        jest.doMock('../services/capacity.service');
        jest.doMock('../services/razorpay.service');
        jest.doMock('../services/notificationPublisher.service');

        app = require('../app').default;
        EventRegistration = require('../models/EventRegistration').default;
        capacityService = require('../services/capacity.service');
    });

    beforeEach(() => jest.clearAllMocks());

    it('double webhook delivery is idempotent (payment.captured twice → state remains completed)', async () => {
        // findOneAndUpdate returns the same row both times. Idempotency at the
        // Mongo level: same filter + same update = same final state. We assert
        // no error + both responses 200.
        (EventRegistration.findOneAndUpdate as jest.Mock).mockResolvedValue({
            _id: 'r-double',
            eventId: eventIdFixed,
            userId,
            attendeeName: 'Anjali',
            paymentStatus: 'completed',
            status: 'confirmed',
        });

        const payload = JSON.stringify({
            event: 'payment.captured',
            payload: {
                payment: {
                    entity: {
                        id: 'pay_dup',
                        order_id: 'order_dup',
                        amount: 49900,
                        currency: 'INR',
                        status: 'captured',
                    },
                },
            },
        });

        for (let i = 0; i < 2; i++) {
            const res = await request(app)
                .post('/api/events/razorpay/webhook')
                .set('X-Razorpay-Signature', signWebhook(payload))
                .set('Content-Type', 'application/json')
                .send(payload);
            expect(res.status).toBe(200);
        }

        // Mongo findOneAndUpdate fires twice — both with the same FILTER (the
        // identifier that selects the row to flip). Update payload bodies are
        // identical except for `paymentCapturedAt: new Date()` which differs
        // by milliseconds. Asserting filter equality + the deterministic
        // fields of the update is sufficient evidence of idempotency.
        // (Phase B improvement: dedup via a processed_webhooks collection
        // before mutating to also suppress duplicate side-effects.)
        expect(EventRegistration.findOneAndUpdate).toHaveBeenCalledTimes(2);
        const calls = (EventRegistration.findOneAndUpdate as jest.Mock).mock.calls;
        expect(calls[0][0]).toEqual(calls[1][0]);
        expect(calls[0][1].paymentStatus).toBe('completed');
        expect(calls[1][1].paymentStatus).toBe('completed');
        expect(calls[0][1].status).toBe('confirmed');
        expect(calls[1][1].status).toBe('confirmed');
        expect(calls[0][1].razorpayPaymentId).toBe('pay_dup');
        expect(calls[1][1].razorpayPaymentId).toBe('pay_dup');
        expect(calls[0][1].paidAmount).toBe(499);
        expect(calls[1][1].paidAmount).toBe(499);
    });

    it('mobile poll succeeds quickly when webhook arrives within 500ms', async () => {
        // Simulate the state-machine flip via the webhook handler. Polling on
        // the mobile side reads the row directly — here we just verify that
        // after the webhook fires, the persisted state is `confirmed` +
        // `completed`. We do this by capturing the $set update payload.
        const flipped: any = { status: 'pending_payment', paymentStatus: 'pending' };
        (EventRegistration.findOneAndUpdate as jest.Mock).mockImplementation((_filter: any, update: any) => {
            Object.assign(flipped, update);
            return Promise.resolve({
                _id: 'r-poll',
                eventId: eventIdFixed,
                userId,
                attendeeName: 'A',
                ...flipped,
            });
        });

        const payload = JSON.stringify({
            event: 'payment.captured',
            payload: {
                payment: {
                    entity: {
                        id: 'pay_quick',
                        order_id: 'order_quick',
                        amount: 49900,
                        currency: 'INR',
                    },
                },
            },
        });

        const t0 = Date.now();
        const res = await request(app)
            .post('/api/events/razorpay/webhook')
            .set('X-Razorpay-Signature', signWebhook(payload))
            .set('Content-Type', 'application/json')
            .send(payload);
        const elapsed = Date.now() - t0;

        expect(res.status).toBe(200);
        // Latency budget: webhook handler is in-process + mocked DB, so this
        // should be well under 500ms (mobile poll cadence)
        expect(elapsed).toBeLessThan(500);
        // State machine flipped exactly as a poll would observe:
        expect(flipped.status).toBe('confirmed');
        expect(flipped.paymentStatus).toBe('completed');
    });

    it('stale cron does NOT sweep registrations newer than 15min', async () => {
        // EventRegistration.find returns empty (no rows older than the cutoff).
        // The worker must still query with createdAt < now-15min — assert the
        // exact cutoff window.
        const { sweepStalePending } = require('../workers/stalePendingCleanup.worker');

        (EventRegistration.find as jest.Mock).mockReturnValue({
            select: jest.fn().mockReturnValue({
                lean: jest.fn().mockResolvedValue([]),
            }),
        });

        const result = await sweepStalePending();
        expect(result.cancelled).toBe(0);
        expect(result.seatsReleased).toBe(0);
        expect(capacityService.releaseSpots).not.toHaveBeenCalled();

        // Verify the cutoff window — the query's createdAt.$lt must be ~15min
        // in the past.
        const callArgs = (EventRegistration.find as jest.Mock).mock.calls[0][0];
        expect(callArgs.paymentStatus).toBe('pending');
        expect(callArgs.status).toBe('pending_payment');
        expect(callArgs.createdAt.$lt).toBeInstanceOf(Date);
        const cutoffMs = (callArgs.createdAt.$lt as Date).getTime();
        const expectedCutoffMs = Date.now() - 15 * 60_000;
        // Within 2s of expected — accounts for test scheduling jitter.
        expect(Math.abs(cutoffMs - expectedCutoffMs)).toBeLessThan(2000);
    });
});

// =========================================================================
// REAL MONGO INTEGRATION TESTS — refund end-to-end, compensation, orphans
// =========================================================================
describe('Razorpay refund + compensation — real Mongo', () => {
    let mongo: MongoMemoryServer;
    let app: any;
    let Event: any;
    let EventRegistration: any;
    let triggerRefund: jest.Mock;
    let createEventOrder: jest.Mock;

    beforeAll(async () => {
        // Throw away the Mocked-block module graph so we get fresh modules.
        // Critical: must happen BEFORE we connect mongoose so the real models
        // bind to the fresh mongoose instance.
        jest.resetModules();
        jest.dontMock('../models/Event');
        jest.dontMock('../models/EventRegistration');
        jest.dontMock('../models/User');
        jest.dontMock('../services/capacity.service');

        // Razorpay client + notifications stay mocked — no real HTTP.
        jest.doMock('../services/razorpay.service', () => ({
            __esModule: true,
            createEventOrder: jest.fn(),
            fetchPayment: jest.fn(),
            triggerRefund: jest.fn(),
            buildRouteTransfer: jest.fn().mockReturnValue(undefined),
            _resetClient: jest.fn(),
        }));
        jest.doMock('../services/notificationPublisher.service', () => ({
            __esModule: true,
            publishNotification: jest.fn(),
        }));

        // Spin up in-memory Mongo + re-require fresh module graph
        mongo = await MongoMemoryServer.create();
        const freshMongoose = require('mongoose');
        await freshMongoose.connect(mongo.getUri());

        app = require('../app').default;
        Event = require('../models/Event').default;
        EventRegistration = require('../models/EventRegistration').default;
        const razorpay = require('../services/razorpay.service');
        triggerRefund = razorpay.triggerRefund;
        createEventOrder = razorpay.createEventOrder;

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
        triggerRefund.mockReset();
        createEventOrder.mockReset();
    });

    it('cancel + refund end-to-end: flex_24h eligible → triggerRefund called → webhook flips to refunded', async () => {
        triggerRefund.mockResolvedValue({ id: 'rfnd_x', status: 'processed', amount: 49900 });

        const ev = await Event.create({
            organizerId: new mongoose.Types.ObjectId(),
            title: 'Refund Test Workshop',
            topicTags: ['audition'],
            registrationMode: 'paid_ticket',
            about: 'A'.repeat(150),
            startsAt: new Date(Date.now() + 48 * 3600_000), // 48h out → > 24h window
            durationKind: 'h2',
            location: { kind: 'in_person', venueName: 'Studio X', address: 'Mumbai' },
            capacity: { total: 10, registeredCount: 1 },
            status: 'live',
            media: [{ kind: 'photo', url: 's3://x', width: 1, height: 1, isHero: true, sortOrder: 0 }],
            pricing: { amount: 499, currency: 'INR', refundPolicy: 'flex_24h' },
        });

        const reg = await EventRegistration.create({
            eventId: ev._id,
            userId,
            status: 'confirmed',
            source: 'paid',
            paymentStatus: 'completed',
            paidAmount: 499,
            razorpayOrderId: 'order_refund_test',
            razorpayPaymentId: 'pay_refund_test',
            attendeeName: 'Refund Tester',
            attendeePhone: '+919876543210',
            attendeeCount: 1,
            visibility: 'private',
        });

        const r1 = await request(app)
            .delete(`/api/events/${(ev._id as any).toString()}/registrations/me`)
            .set('Authorization', `Bearer ${token}`);

        expect(r1.status).toBe(200);
        expect(r1.body.data.refundIssued).toBe(true);
        expect(r1.body.data.refundAmount).toBe(499);
        expect(triggerRefund).toHaveBeenCalledWith('pay_refund_test', 499);

        // Now simulate refund.processed webhook arriving
        const payload = JSON.stringify({
            event: 'refund.processed',
            payload: {
                refund: {
                    entity: { id: 'rfnd_x', payment_id: 'pay_refund_test', amount: 49900 },
                },
            },
        });
        const r2 = await request(app)
            .post('/api/events/razorpay/webhook')
            .set('X-Razorpay-Signature', signWebhook(payload))
            .set('Content-Type', 'application/json')
            .send(payload);

        expect(r2.status).toBe(200);

        // Verify final state in real DB
        const final: any = await EventRegistration.findById(reg._id).lean();
        expect(final.paymentStatus).toBe('refunded');
        expect(final.refundAmount).toBe(499);
        expect(final.refundedAt).toBeInstanceOf(Date);
        // Cancellation pre-set by the cancel handler
        expect(final.status).toBe('cancelled');
    });

    it('multi-attendee paid registration with dup-key failure releases all 3 seats', async () => {
        createEventOrder.mockResolvedValue({
            id: 'order_multi',
            amount: 149700,
            currency: 'INR',
            receipt: 'r',
            status: 'created',
        });

        const ev = await Event.create({
            organizerId: new mongoose.Types.ObjectId(),
            title: 'Multi-Attendee Paid',
            topicTags: ['audition'],
            registrationMode: 'paid_ticket',
            about: 'A'.repeat(150),
            startsAt: new Date(Date.now() + 48 * 3600_000),
            durationKind: 'h2',
            location: { kind: 'in_person', venueName: 'Studio X', address: 'Mumbai' },
            capacity: { total: 10, registeredCount: 1 },
            status: 'live',
            media: [{ kind: 'photo', url: 's3://x', width: 1, height: 1, isHero: true, sortOrder: 0 }],
            pricing: { amount: 499, currency: 'INR', refundPolicy: 'flex_24h' },
        });

        // Pre-existing confirmed registration for the SAME user → triggers
        // dup-key (11000) on the partial unique index when we try again.
        await EventRegistration.create({
            eventId: ev._id,
            userId,
            status: 'confirmed',
            source: 'paid',
            paymentStatus: 'completed',
            paidAmount: 499,
            razorpayOrderId: 'order_existing',
            razorpayPaymentId: 'pay_existing',
            attendeeName: 'Existing',
            attendeePhone: '+919876543210',
            attendeeCount: 1,
            visibility: 'private',
        });

        const before = await Event.findById(ev._id).lean();
        expect((before as any).capacity.registeredCount).toBe(1);

        const r = await request(app)
            .post(`/api/events/${(ev._id as any).toString()}/register`)
            .set('Authorization', `Bearer ${token}`)
            .send({
                attendeeName: 'Duplicate Attempt',
                attendeePhone: '+919876543210',
                attendeeCount: 3,
            });

        // Dup-key → 409 from the controller
        expect(r.status).toBe(409);

        // CRITICAL invariant: capacity.registeredCount unchanged. Reserve(+3)
        // then release(-3) on dup-key, net 0 delta on top of the existing 1.
        const after = await Event.findById(ev._id).lean();
        expect((after as any).capacity.registeredCount).toBe(1);
    });

    it('orphan payment.captured webhook (no matching order) acks 200 and does not mutate state', async () => {
        const payload = JSON.stringify({
            event: 'payment.captured',
            payload: {
                payment: {
                    entity: {
                        id: 'pay_orphan',
                        order_id: 'order_orphan_nomatch',
                        amount: 49900,
                        currency: 'INR',
                    },
                },
            },
        });

        const r = await request(app)
            .post('/api/events/razorpay/webhook')
            .set('X-Razorpay-Signature', signWebhook(payload))
            .set('Content-Type', 'application/json')
            .send(payload);

        // Ack 200 so Razorpay doesn't retry forever
        expect(r.status).toBe(200);

        // No registration matched → no mutation. Verify nothing was inserted
        // or modified in the real DB.
        const all = await EventRegistration.find().lean();
        expect(all.length).toBe(0);
    });
});
