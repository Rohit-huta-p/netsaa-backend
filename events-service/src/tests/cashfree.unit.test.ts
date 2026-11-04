import crypto from 'crypto';
import { cashfreeProvider, mapVendorStatus } from '../services/payments/cashfree';
import { toRupees2dp, paiseToRupees } from '../services/payments/types';

describe('cashfree provider — pure logic', () => {
  describe('mapVendorStatus', () => {
    it('ACTIVE → verified', () => expect(mapVendorStatus('ACTIVE')).toBe('verified'));
    it('in-progress states → pending_kyc', () => {
      for (const s of ['IN_BANK_VALIDATION', 'IN_BENE_CREATION', 'IN_KYC_REVIEW']) {
        expect(mapVendorStatus(s)).toBe('pending_kyc');
      }
    });
    it('failure states → rejected', () => {
      for (const s of ['BANK_VALIDATION_FAILED', 'BENE_CREATION_FAILED', 'ACTION_REQUIRED']) {
        expect(mapVendorStatus(s)).toBe('rejected');
      }
    });
    it('ON_HOLD / BLOCKED → suspended', () => {
      expect(mapVendorStatus('ON_HOLD')).toBe('suspended');
      expect(mapVendorStatus('BLOCKED')).toBe('suspended');
    });
    it('DELETED → not_started', () => expect(mapVendorStatus('DELETED')).toBe('not_started'));
    it('unknown/empty → pending_kyc (never auto-verify)', () => {
      expect(mapVendorStatus('SOMETHING_NEW')).toBe('pending_kyc');
      expect(mapVendorStatus(undefined)).toBe('pending_kyc');
      expect(mapVendorStatus('')).toBe('pending_kyc');
    });
    it('is case-insensitive', () => expect(mapVendorStatus('active')).toBe('verified'));
  });

  describe('units (paise ↔ rupees)', () => {
    it('paiseToRupees converts correctly', () => {
      expect(paiseToRupees(123456)).toBe(1234.56);
      expect(paiseToRupees(100)).toBe(1);
      expect(paiseToRupees(1)).toBe(0.01);
    });
    it('toRupees2dp rounds to 2dp', () => {
      expect(toRupees2dp(10.005)).toBe(10.01);
      expect(toRupees2dp(10.004)).toBe(10);
      expect(toRupees2dp(1234.567)).toBe(1234.57);
    });
  });

  describe('verifyWebhookSignature', () => {
    const secret = 'test_client_secret';
    const ts = '1730600000000';
    const body = '{"type":"PAYMENT_SUCCESS_WEBHOOK","data":{"order":{"order_id":"evt_x"}}}';

    beforeAll(() => { process.env.CASHFREE_SECRET_KEY = secret; });

    const sign = (s: string, t: string, b: string) =>
      crypto.createHmac('sha256', s).update(t + b).digest('base64');

    it('accepts a correctly-signed payload', () => {
      const sig = sign(secret, ts, body);
      expect(cashfreeProvider.verifyWebhookSignature(body, sig, ts)).toBe(true);
    });
    it('rejects a tampered body', () => {
      const sig = sign(secret, ts, body);
      expect(cashfreeProvider.verifyWebhookSignature(body + ' ', sig, ts)).toBe(false);
    });
    it('rejects a wrong timestamp', () => {
      const sig = sign(secret, ts, body);
      expect(cashfreeProvider.verifyWebhookSignature(body, sig, '0')).toBe(false);
    });
    it('rejects a signature made with the wrong secret', () => {
      const sig = sign('other_secret', ts, body);
      expect(cashfreeProvider.verifyWebhookSignature(body, sig, ts)).toBe(false);
    });
    it('rejects empty inputs', () => {
      expect(cashfreeProvider.verifyWebhookSignature(body, '', ts)).toBe(false);
      expect(cashfreeProvider.verifyWebhookSignature(body, 'x', '')).toBe(false);
    });
  });

  describe('CASHFREE_DEV_MODE', () => {
    it('fakes vendor + order + refund + signature with no network/creds', async () => {
      jest.resetModules();
      const prev = process.env.CASHFREE_DEV_MODE;
      process.env.CASHFREE_DEV_MODE = '1';
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { cashfreeProvider: dev } = require('../services/payments/cashfree');

      const v = await dev.createVendor({ vendorId: 'u1', name: 'A', email: 'a@b.c', pan: 'ABCDE1234F', businessType: 'individual' });
      expect(v.status).toBe('verified');
      expect(v.vendorId).toBe('u1');

      const o = await dev.createOrderWithSplit({ orderId: 'evt_1', amountRupees: 100, customer: { id: 'u1', phone: '9' }, vendorId: 'u1', vendorAmountRupees: 90 });
      expect(o.orderId).toBe('evt_1');
      expect(o.paymentSessionId).toMatch(/^session_dev_/);

      expect(dev.verifyWebhookSignature('any', 'any', 'any')).toBe(true);
      const r = await dev.createRefund({ orderId: 'evt_1', amountRupees: 50, refundId: 'rf_1' });
      expect(r.status).toBe('SUCCESS');

      if (prev === undefined) delete process.env.CASHFREE_DEV_MODE; else process.env.CASHFREE_DEV_MODE = prev;
      jest.resetModules();
    });
  });
});
