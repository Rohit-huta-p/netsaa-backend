// Cashfree Easy Split provider (PG + Easy Split). No SDK dependency — uses Node 20+
// global fetch + crypto, so nothing new to install. All Cashfree HTTP stays in this file.
//
// Docs (confirmed 2026-11-03):
//  - Base: sandbox https://sandbox.cashfree.com/pg | prod https://api.cashfree.com/pg
//  - Auth: x-client-id + x-client-secret, header x-api-version: 2026-01-01
//  - Create order: POST /orders (order_amount in RUPEES, <=45-char order_id) → payment_session_id
//    Static split: order_splits:[{vendor_id, amount}] auto-splits on capture; NETSA keeps the remainder
//  - Vendor: POST /easy-split/vendors (vendor_id,status,name,email,phone,kyc_details{pan} + bank|upi)
//  - Refund: POST /orders/{order_id}/refunds (refund_amount RUPEES, refund_id 3-40 chars)
//  - Webhook sig: base64( HMAC_SHA256(clientSecret, x-webhook-timestamp + rawBody) )

import crypto from 'crypto';
import type { PayoutStatus } from '../../models/UserPayoutAccount';
import {
  PaymentProvider, VendorInput, OrderInput, RefundInput,
  VendorResult, OrderResult, RefundResult, toRupees2dp,
} from './types';

const CF_ENV = (process.env.CASHFREE_ENV || 'sandbox').toLowerCase();
const BASE = CF_ENV === 'production' ? 'https://api.cashfree.com/pg' : 'https://sandbox.cashfree.com/pg';
const API_VERSION = process.env.CASHFREE_API_VERSION || '2026-01-01';
const DEV = process.env.CASHFREE_DEV_MODE === '1';

function creds(): { id: string; secret: string } {
  const id = process.env.CASHFREE_APP_ID;
  const secret = process.env.CASHFREE_SECRET_KEY;
  if (!id || !secret) throw new Error('CASHFREE_APP_ID / CASHFREE_SECRET_KEY not set');
  return { id, secret };
}

/** Thin JSON fetch wrapper with Cashfree auth + clean error surfacing. */
async function cf(path: string, method: 'GET' | 'POST', body?: unknown): Promise<any> {
  const { id, secret } = creds();
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-api-version': API_VERSION,
      'x-client-id': id,
      'x-client-secret': secret,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: any;
  try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
  if (!res.ok) {
    const err: any = new Error(json?.message || `Cashfree ${method} ${path} failed (${res.status})`);
    err.status = res.status;
    err.code = json?.code;
    err.cashfree = json;
    throw err;
  }
  return json;
}

/** Cashfree vendor lifecycle → our PayoutStatus. Unknown → pending_kyc (never auto-verify). */
export function mapVendorStatus(cfStatus: string | undefined): PayoutStatus {
  switch ((cfStatus || '').toUpperCase()) {
    case 'ACTIVE':
      return 'verified';
    case 'IN_BANK_VALIDATION':
    case 'IN_BENE_CREATION':
    case 'IN_KYC_REVIEW':
      return 'pending_kyc';
    case 'BANK_VALIDATION_FAILED':
    case 'BENE_CREATION_FAILED':
    case 'ACTION_REQUIRED':
      return 'rejected';
    case 'ON_HOLD':
    case 'BLOCKED':
      return 'suspended';
    case 'DELETED':
      return 'not_started';
    default:
      return 'pending_kyc';
  }
}

function accountType(businessType: string): 'INDIVIDUAL' | 'BUSINESS' {
  return businessType === 'individual' ? 'INDIVIDUAL' : 'BUSINESS';
}

export const cashfreeProvider: PaymentProvider = {
  name: 'cashfree',

  async createVendor(v: VendorInput): Promise<VendorResult> {
    if (DEV) return { vendorId: v.vendorId, status: 'verified', raw: 'DEV_MODE' };

    const body: any = {
      vendor_id: v.vendorId,
      status: 'ACTIVE', // request intent; Cashfree returns the real onboarding status
      name: v.name,
      email: v.email,
      // Cashfree requires a phone; sourced upstream. Placeholder keeps dev/test unblocked.
      // TODO(prod): pass the organizer's real phone (users-service lookup or a wizard field).
      phone: v.phone || '9999999999',
      verify_account: true,
      dashboard_access: false,
      kyc_details: {
        account_type: accountType(v.businessType),
        business_type: v.businessType,
        pan: v.pan,
      },
    };
    if (v.vpa) {
      body.upi = { vpa: v.vpa, account_holder: v.name };
    } else if (v.bankAccount && v.ifsc) {
      body.bank = { account_number: v.bankAccount, account_holder: v.name, ifsc: v.ifsc };
    }

    const res = await cf('/easy-split/vendors', 'POST', body);
    return { vendorId: res.vendor_id || v.vendorId, status: mapVendorStatus(res.status), raw: res.status };
  },

  async getVendorStatus(vendorId: string): Promise<VendorResult> {
    if (DEV) return { vendorId, status: 'verified', raw: 'DEV_MODE' };
    const res = await cf(`/easy-split/vendors/${encodeURIComponent(vendorId)}`, 'GET');
    return { vendorId, status: mapVendorStatus(res.status), raw: res.status };
  },

  async createOrderWithSplit(o: OrderInput): Promise<OrderResult> {
    if (DEV) {
      return { orderId: o.orderId, paymentSessionId: `session_dev_${crypto.randomBytes(12).toString('hex')}` };
    }
    const body = {
      order_id: o.orderId,
      order_amount: toRupees2dp(o.amountRupees),
      order_currency: 'INR',
      customer_details: {
        customer_id: o.customer.id,
        customer_phone: o.customer.phone,
        ...(o.customer.email ? { customer_email: o.customer.email } : {}),
        ...(o.customer.name ? { customer_name: o.customer.name } : {}),
      },
      // Static split at creation: Cashfree auto-splits to the vendor on capture.
      order_splits: [{ vendor_id: o.vendorId, amount: toRupees2dp(o.vendorAmountRupees) }],
      ...(o.notes ? { order_tags: o.notes } : {}),
    };
    const res = await cf('/orders', 'POST', body);
    return { orderId: res.order_id || o.orderId, paymentSessionId: res.payment_session_id };
  },

  verifyWebhookSignature(rawBody: string, signature: string, timestamp: string): boolean {
    if (DEV) return true;
    // Cashfree signs with the client secret (allow an explicit override if ever needed).
    const secret = process.env.CASHFREE_WEBHOOK_SECRET || process.env.CASHFREE_SECRET_KEY || '';
    if (!secret || !signature || !timestamp) return false;
    const expected = crypto.createHmac('sha256', secret).update(timestamp + rawBody).digest('base64');
    try {
      const a = Buffer.from(expected);
      const b = Buffer.from(signature);
      return a.length === b.length && crypto.timingSafeEqual(a, b);
    } catch {
      return false;
    }
  },

  async createRefund(input: RefundInput): Promise<RefundResult> {
    if (DEV) return { refundId: input.refundId, status: 'SUCCESS' };
    const body: any = {
      refund_amount: toRupees2dp(input.amountRupees),
      refund_id: input.refundId,
    };
    // Sandbox simulates the outcome from refund_note; force SUCCESS in non-prod.
    if (CF_ENV !== 'production') body.refund_note = 'SUCCESS';
    const res = await cf(`/orders/${encodeURIComponent(input.orderId)}/refunds`, 'POST', body);
    return { refundId: res.refund_id || input.refundId, status: res.refund_status || 'PENDING' };
  },
};
