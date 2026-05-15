import crypto from 'crypto';

/**
 * Verify a Razorpay webhook signature.
 *
 * Razorpay sends X-Razorpay-Signature: HMAC-SHA256(payload, webhook_secret).
 * We recompute on our side and compare via crypto.timingSafeEqual to prevent
 * timing attacks.
 *
 * IMPORTANT: payload must be the EXACT raw body bytes Razorpay sent. Don't
 * JSON.parse → JSON.stringify — that re-formatting breaks the signature.
 * Use express.raw({ type: 'application/json' }) middleware on the webhook route.
 */
export function verifyWebhookSignature(rawPayload: string | Buffer, signature: string): boolean {
    if (!signature) return false;
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret) {
        console.error('RAZORPAY_WEBHOOK_SECRET not set — rejecting all webhooks');
        return false;
    }

    const expected = crypto.createHmac('sha256', secret).update(rawPayload).digest('hex');

    // Length check before timingSafeEqual (which throws on mismatched buffers)
    if (expected.length !== signature.length) return false;

    try {
        return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
    } catch {
        return false;
    }
}
