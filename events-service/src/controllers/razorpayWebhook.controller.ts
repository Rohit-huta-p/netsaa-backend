import { Request, Response } from 'express';
import EventRegistration from '../models/EventRegistration';
import { verifyWebhookSignature } from '../utils/webhookSignature';
import { releaseSpots } from '../services/capacity.service';
import { publishNotification } from '../services/notificationPublisher.service';
import { emit } from '../utils/observability';

interface RazorpayWebhookEvent {
    event: string;
    payload: {
        payment?: { entity: { id: string; order_id: string; amount: number; currency: string; status?: string; method?: string } };
        refund?: { entity: { id: string; payment_id: string; amount: number; status?: string } };
        order?: { entity: { id: string; amount: number } };
    };
}

export async function handleRazorpayWebhook(req: Request, res: Response) {
    try {
        const signature = req.headers['x-razorpay-signature'] as string;
        if (!signature) {
            return res.status(400).json({ message: 'Missing X-Razorpay-Signature header' });
        }

        // req.body is the raw Buffer when express.raw is used; convert for signature check
        const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body));
        const rawString = rawBody.toString('utf8');

        if (!verifyWebhookSignature(rawString, signature)) {
            emit('razorpay_webhook_signature_invalid', 'warn', {
                bytes: rawString.length,
            });
            return res.status(401).json({ message: 'Invalid signature' });
        }

        const event: RazorpayWebhookEvent = JSON.parse(rawString);
        emit('razorpay_webhook_received', 'info', { type: event.event });

        switch (event.event) {
            case 'payment.captured':
                await handlePaymentCaptured(event);
                break;
            case 'payment.failed':
                await handlePaymentFailed(event);
                break;
            case 'refund.processed':
                await handleRefundProcessed(event);
                break;
            default:
                // Unknown events — ack with 200 so Razorpay doesn't retry
                emit('razorpay_webhook_unhandled', 'info', { type: event.event });
                break;
        }

        return res.status(200).json({ ok: true });
    } catch (err) {
        console.error('razorpay webhook error:', err);
        // Return 500 so Razorpay retries
        return res.status(500).json({ message: 'Internal server error' });
    }
}

async function handlePaymentCaptured(event: RazorpayWebhookEvent) {
    const payment = event.payload.payment?.entity;
    if (!payment) return;

    const amountInRupees = payment.amount / 100;

    // Idempotent: findOneAndUpdate with razorpayOrderId. If already completed, no-op.
    const updated = await EventRegistration.findOneAndUpdate(
        { razorpayOrderId: payment.order_id },
        {
            paymentStatus: 'completed',
            status: 'confirmed',
            razorpayPaymentId: payment.id,
            paidAmount: amountInRupees,
            paymentCapturedAt: new Date(),
        },
        { new: true }
    );

    if (!updated) {
        emit('razorpay_webhook_orphan_capture', 'warn', { orderId: payment.order_id, paymentId: payment.id });
        return;
    }

    await publishNotification({
        subtype: 'event.payment_captured',
        eventId: (updated as any).eventId?.toString(),
        userId: (updated as any).userId?.toString(),
        amountInRupees,
        registrantName: (updated as any).attendeeName,
    });
}

async function handlePaymentFailed(event: RazorpayWebhookEvent) {
    const payment = event.payload.payment?.entity;
    if (!payment) return;

    const updated = await EventRegistration.findOneAndUpdate(
        { razorpayOrderId: payment.order_id, paymentStatus: 'pending' },
        {
            paymentStatus: 'failed',
            status: 'cancelled',
            razorpayPaymentId: payment.id,
            cancelledAt: new Date(),
        },
        { new: true }
    );

    if (!updated) return;

    const seats = (updated as any).attendeeCount ?? 1;
    const eventId = (updated as any).eventId?.toString();
    if (eventId) await releaseSpots(eventId, seats);

    emit('razorpay_payment_failed', 'warn', {
        eventId,
        paymentId: payment.id,
        seatsReleased: seats,
    });
}

async function handleRefundProcessed(event: RazorpayWebhookEvent) {
    const refund = event.payload.refund?.entity;
    if (!refund) return;

    const refundedRupees = refund.amount / 100;
    await EventRegistration.findOneAndUpdate(
        { razorpayPaymentId: refund.payment_id },
        {
            paymentStatus: 'refunded',
            refundedAt: new Date(),
            refundAmount: refundedRupees,
        },
        { new: true }
    );

    emit('razorpay_refund_processed', 'info', {
        paymentId: refund.payment_id,
        refundedRupees,
    });
}
