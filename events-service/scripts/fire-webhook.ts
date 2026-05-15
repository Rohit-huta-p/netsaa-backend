/**
 * Manually fire payment.captured webhook for localhost dev.
 * Razorpay can't reach localhost — without ngrok, real webhooks never arrive.
 * This script simulates the webhook with a valid HMAC signature.
 *
 *   npx ts-node scripts/fire-webhook.ts <razorpayOrderId> [paidAmountRupees]
 */
import dotenv from 'dotenv';
import crypto from 'crypto';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

async function main() {
    const orderId = process.argv[2];
    const amountRupees = Number(process.argv[3] ?? 0);
    if (!orderId) {
        console.error('Usage: npx ts-node scripts/fire-webhook.ts <razorpayOrderId> [paidAmountRupees]');
        process.exit(1);
    }

    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret) {
        console.error('RAZORPAY_WEBHOOK_SECRET not set');
        process.exit(1);
    }

    const fakePaymentId = `pay_local_${Date.now()}`;
    const amountPaise = Math.round(amountRupees * 100) || 100000;

    const event = {
        event: 'payment.captured',
        payload: {
            payment: {
                entity: {
                    id: fakePaymentId,
                    order_id: orderId,
                    amount: amountPaise,
                    currency: 'INR',
                    status: 'captured',
                    method: 'card',
                },
            },
        },
    };

    const body = JSON.stringify(event);
    const signature = crypto.createHmac('sha256', secret).update(body).digest('hex');

    console.log('Firing webhook...');
    console.log('  orderId:', orderId);
    console.log('  paymentId:', fakePaymentId);
    console.log('  amount:', amountPaise, 'paise');
    console.log('');

    const url = `http://localhost:${process.env.PORT || 5003}/api/events/razorpay/webhook`;
    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Razorpay-Signature': signature,
        },
        body,
    });

    console.log('Response:', res.status, await res.text());
    process.exit(0);
}

main().catch((err) => {
    console.error('FAILED:', err);
    process.exit(1);
});
