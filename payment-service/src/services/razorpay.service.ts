import Razorpay from 'razorpay';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Razorpay Service — Wraps Razorpay SDK for NETSA
 *
 * Handles order creation, Route transfers (instant split),
 * and webhook signature verification.
 *
 * NO ESCROW. Every payment triggers an immediate Route transfer:
 * 88% to artist's linked account, 12% stays with NETSA.
 */

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID || '',
    key_secret: process.env.RAZORPAY_KEY_SECRET || '',
});

/**
 * Create a Razorpay order for checkout.
 * Amount should be in INR (will be converted to paise).
 */
export async function createOrder(
    amount: number,
    currency: string = 'INR',
    receipt: string,
    notes: Record<string, string> = {}
) {
    const order = await razorpay.orders.create({
        amount: Math.round(amount * 100), // Convert to paise
        currency,
        receipt,
        notes,
    });
    return order;
}

/**
 * Create a Route transfer after payment capture.
 * Sends the artist's share to their linked Razorpay account.
 */
export async function createRouteTransfer(
    paymentId: string,
    artistLinkedAccountId: string,
    artistAmount: number,
    notes: Record<string, string> = {}
) {
    const transfer = await (razorpay.payments as any).transfer(paymentId, {
        transfers: [
            {
                account: artistLinkedAccountId,
                amount: Math.round(artistAmount * 100), // Paise
                currency: 'INR',
                notes,
                on_hold: false,
            },
        ],
    });
    return transfer;
}

/**
 * Verify Razorpay payment signature.
 * Standard verification for confirming payment after checkout.
 */
export function verifyPaymentSignature(
    orderId: string,
    paymentId: string,
    signature: string
): boolean {
    const body = orderId + '|' + paymentId;
    const expectedSignature = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || '')
        .update(body)
        .digest('hex');
    return expectedSignature === signature;
}

/**
 * Verify Razorpay webhook signature.
 * Uses the webhook secret (different from key secret).
 * Must receive the raw request body, not parsed JSON.
 */
export function verifyWebhookSignature(
    rawBody: string | Buffer,
    signature: string
): boolean {
    const expectedSignature = crypto
        .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET || '')
        .update(rawBody)
        .digest('hex');
    return expectedSignature === signature;
}

/**
 * Fetch payment details by order ID.
 * Used for reconciliation and status checks.
 */
export async function fetchPaymentsByOrder(orderId: string) {
    const payments = await razorpay.orders.fetchPayments(orderId);
    return payments;
}

export default razorpay;
