import { Request, Response } from 'express';
import Transaction from '../models/Transaction';
import { verifyWebhookSignature } from '../services/razorpay.service';

/**
 * Razorpay Webhook Handler
 *
 * This endpoint receives raw body (express.raw) for signature verification.
 * All processing is idempotent: checks timeline before acting.
 *
 * Events handled:
 * - payment.authorized: Payment authorized by bank
 * - payment.captured: Payment captured (money deducted)
 * - payment.failed: Payment failed
 * - transfer.processed: Route transfer completed to artist
 * - refund.created: Refund initiated
 */
export const handleRazorpayWebhook = async (req: Request, res: Response) => {
    try {
        const signature = req.headers['x-razorpay-signature'] as string;
        if (!signature) {
            return res.status(400).json({ error: 'Missing signature' });
        }

        // Verify signature using raw body
        const rawBody = (req as any).rawBody || req.body;
        const isValid = verifyWebhookSignature(
            typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody),
            signature
        );
        if (!isValid) {
            return res.status(400).json({ error: 'Invalid signature' });
        }

        const payload = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody;
        const event = payload.event;
        const paymentEntity = payload.payload?.payment?.entity;

        if (!paymentEntity) {
            return res.status(200).json({ received: true, skipped: 'no payment entity' });
        }

        const orderId = paymentEntity.order_id;
        const transaction = await Transaction.findOne({ razorpayOrderId: orderId });

        if (!transaction) {
            console.warn(`Webhook: No transaction found for order ${orderId}`);
            return res.status(200).json({ received: true, skipped: 'no matching transaction' });
        }

        // Idempotency: check if this event was already processed
        const alreadyProcessed = transaction.timeline.some(t => t.event === `webhook_${event}`);
        if (alreadyProcessed) {
            return res.status(200).json({ received: true, skipped: 'already processed' });
        }

        switch (event) {
            case 'payment.captured':
                if (transaction.status === 'created') {
                    transaction.status = 'paid';
                    transaction.razorpayPaymentId = paymentEntity.id;
                }
                break;

            case 'payment.failed':
                if (transaction.status === 'created') {
                    transaction.status = 'failed';
                }
                break;

            case 'transfer.processed':
                const transferEntity = payload.payload?.transfer?.entity;
                if (transferEntity && transaction.status === 'paid') {
                    transaction.razorpayTransferId = transferEntity.id;
                    transaction.status = 'confirmed';
                }
                break;

            case 'refund.created':
                transaction.status = 'refunded';
                break;

            default:
                // Log but don't process unknown events
                break;
        }

        transaction.timeline.push({
            event: `webhook_${event}`,
            at: new Date(),
            metadata: { paymentId: paymentEntity.id },
        });

        await transaction.save();

        res.status(200).json({ received: true, processed: event });
    } catch (error: any) {
        console.error('Webhook error:', error);
        // Always return 200 to Razorpay to prevent retries on our errors
        res.status(200).json({ received: true, error: error.message });
    }
};
