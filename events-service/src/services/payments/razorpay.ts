// Razorpay adapter — maps the legacy in-process Razorpay helpers (../razorpay.ts) onto the
// PaymentProvider interface, as a rollback path (PAYMENT_PROVIDER=razorpay). Note: the
// Razorpay events path never actually ran in any environment (no RAZORPAY keys were ever
// set), so this is a structural fallback, not a battle-tested one. Cashfree is the default.

import * as rzp from '../razorpay';
import {
  PaymentProvider, VendorInput, OrderInput, RefundInput,
  VendorResult, OrderResult, RefundResult,
} from './types';

function rupeesToPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

export const razorpayProvider: PaymentProvider = {
  name: 'razorpay',

  async createVendor(v: VendorInput): Promise<VendorResult> {
    const { linkedAccountId } = await rzp.createLinkedAccount({
      email: v.email, name: v.name, pan: v.pan,
      bankAccount: v.bankAccount || '', ifsc: v.ifsc || '', businessType: v.businessType,
    });
    // Legacy behavior: Route accounts were treated as verified on create.
    return { vendorId: linkedAccountId, status: 'verified', raw: 'razorpay' };
  },

  async getVendorStatus(vendorId: string): Promise<VendorResult> {
    // Razorpay events path had no account-status API wired; preserve legacy "verified".
    return { vendorId, status: 'verified', raw: 'razorpay' };
  },

  async createOrderWithSplit(o: OrderInput): Promise<OrderResult> {
    const { orderId } = await rzp.createOrderWithTransfer({
      amountPaise: rupeesToPaise(o.amountRupees),
      receipt: o.orderId,
      linkedAccountId: o.vendorId,
      organizerNetPaise: rupeesToPaise(o.vendorAmountRupees),
    });
    return { orderId, paymentSessionId: '' }; // Razorpay FE uses orderId + key, no session id
  },

  verifyWebhookSignature(rawBody: string, signature: string, _timestamp: string): boolean {
    return rzp.verifyWebhookSignature(rawBody, signature, process.env.RAZORPAY_WEBHOOK_SECRET || '');
  },

  async createRefund(input: RefundInput): Promise<RefundResult> {
    if (!input.paymentId) throw new Error('razorpay refund requires paymentId');
    const { refundId } = await rzp.createRefund(input.paymentId, rupeesToPaise(input.amountRupees));
    return { refundId, status: 'processed' };
  },
};
