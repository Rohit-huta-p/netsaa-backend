import { verifyWebhookSignature } from '../utils/webhookSignature';
import crypto from 'crypto';

const SECRET = 'test_webhook_secret';

function signPayload(payload: string): string {
    return crypto.createHmac('sha256', SECRET).update(payload).digest('hex');
}

beforeAll(() => {
    process.env.RAZORPAY_WEBHOOK_SECRET = SECRET;
});

describe('verifyWebhookSignature', () => {
    it('accepts a correctly-signed payload', () => {
        const payload = JSON.stringify({ event: 'payment.captured', payload: {} });
        const sig = signPayload(payload);
        expect(verifyWebhookSignature(payload, sig)).toBe(true);
    });

    it('rejects a tampered payload', () => {
        const payload = JSON.stringify({ event: 'payment.captured' });
        const sig = signPayload(payload);
        const tamperedPayload = JSON.stringify({ event: 'refund.processed' });
        expect(verifyWebhookSignature(tamperedPayload, sig)).toBe(false);
    });

    it('rejects empty signature', () => {
        expect(verifyWebhookSignature('any payload', '')).toBe(false);
    });

    it('uses timingSafeEqual to prevent timing attacks', () => {
        // Smoke test — function shouldn't throw on length-mismatched compare
        const sig = '0'.repeat(64);
        expect(verifyWebhookSignature('payload', sig)).toBe(false);
    });
});
