// Provider-agnostic payment interface for events-service.
//
// Events is NETSA's only paid surface (gig/contract payments are deferred; sub-artist
// is cut project-wide), so the money layer lives here in-process behind this interface.
// `index.ts` selects the implementation by PAYMENT_PROVIDER. Keeping the surface small
// and provider-neutral means the active provider (Cashfree) can later be lifted into a
// dedicated payment-service without rewriting the call sites, and Razorpay stays as a
// rollback.
//
// UNITS: every amount crossing this boundary is in RUPEES (decimal, 2dp) — NOT paise.
// Internal event money math (utils/eventFees.ts) is in paise; convert once, right here
// at the provider edge.

import type { PayoutStatus } from '../../models/UserPayoutAccount';

/** Organizer payout identity (Cashfree Easy Split "vendor" / Razorpay Route "linked account"). */
export interface VendorInput {
  /** Our stable id for the payee (e.g. the organizer's userId) → provider vendor_id. */
  vendorId: string;
  name: string;
  email: string;
  /** Required by Cashfree. Sourced from the user's account; placeholder in dev. */
  phone?: string;
  pan: string;
  /** Our BusinessType: individual | sole_prop | partnership | llp | pvt_ltd. */
  businessType: string;
  /** Provide EITHER bank (account + ifsc) OR vpa — not both (Cashfree rejects both). */
  bankAccount?: string;
  ifsc?: string;
  vpa?: string;
}

export interface OrderInput {
  /** Idempotent, provider-safe order id (<=45 chars for Cashfree). */
  orderId: string;
  /** What the customer pays, in RUPEES. */
  amountRupees: number;
  customer: { id: string; phone: string; email?: string; name?: string };
  /** Payee (organizer) provider vendor id. */
  vendorId: string;
  /** The organizer's split, in RUPEES. Platform keeps (amountRupees - vendorAmountRupees). */
  vendorAmountRupees: number;
  notes?: Record<string, string>;
}

export interface RefundInput {
  /** Cashfree refunds by order_id. */
  orderId: string;
  /** Razorpay refunds by payment_id (adapter only). */
  paymentId?: string;
  amountRupees: number;
  /** Unique per refund, 3-40 chars for Cashfree. */
  refundId: string;
}

export interface VendorResult {
  vendorId: string;
  status: PayoutStatus;
  /** The provider's raw status string, for audit. */
  raw?: string;
  reason?: string;
}

export interface OrderResult {
  orderId: string;
  /** Cashfree checkout handle for the FE SDK. Empty for providers without one. */
  paymentSessionId: string;
}

export interface RefundResult {
  refundId: string;
  status: string;
}

export interface PaymentProvider {
  readonly name: 'cashfree' | 'razorpay';
  createVendor(v: VendorInput): Promise<VendorResult>;
  getVendorStatus(vendorId: string): Promise<VendorResult>;
  createOrderWithSplit(o: OrderInput): Promise<OrderResult>;
  /** Verify a provider webhook over the RAW (unparsed) body. Constant-time. */
  verifyWebhookSignature(rawBody: string, signature: string, timestamp: string): boolean;
  createRefund(input: RefundInput): Promise<RefundResult>;
}

/** Round a rupee amount to 2 decimals for the provider boundary. */
export function toRupees2dp(rupees: number): number {
  return Math.round(rupees * 100) / 100;
}

/** Convert paise (internal) → rupees (provider boundary), 2dp. */
export function paiseToRupees(paise: number): number {
  return Math.round(paise) / 100;
}
