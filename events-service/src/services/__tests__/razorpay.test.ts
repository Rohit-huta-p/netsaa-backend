import crypto from 'crypto';
import { verifyWebhookSignature, maskPan, maskAccount } from '../razorpay';

describe('razorpayService', () => {
  describe('verifyWebhookSignature', () => {
    it('accepts a correctly signed payload', () => {
      const secret = 'whsec_test';
      const body = JSON.stringify({ event: 'payment.captured' });
      const sig = crypto.createHmac('sha256', secret).update(body).digest('hex');
      expect(verifyWebhookSignature(body, sig, secret)).toBe(true);
    });
    it('rejects a tampered payload', () => {
      const secret = 'whsec_test';
      const body = JSON.stringify({ event: 'payment.captured' });
      const sig = crypto.createHmac('sha256', secret).update(body).digest('hex');
      expect(verifyWebhookSignature(JSON.stringify({ event: 'x' }), sig, secret)).toBe(false);
    });
  });

  describe('masking', () => {
    it('masks PAN keeping first 5 + last 1', () => {
      expect(maskPan('ABCDE1234F')).toBe('ABCDE****F');
    });
    it('masks account keeping last 4', () => {
      expect(maskAccount('50123456789012')).toBe('****9012');
    });
  });
});
