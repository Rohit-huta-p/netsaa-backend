import crypto from 'crypto';
// @ts-ignore
import Razorpay from 'razorpay';

const keyId = process.env.RAZORPAY_KEY_ID;
const keySecret = process.env.RAZORPAY_KEY_SECRET;

// Lazily construct so tests that only need pure helpers don't require keys.
let _client: any | null = null;
export function razorpayClient(): any {
  if (!_client) {
    if (!keyId || !keySecret) throw new Error('RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET not set');
    _client = new Razorpay({ key_id: keyId, key_secret: keySecret });
  }
  return _client;
}

export function verifyWebhookSignature(rawBody: string, signature: string, secret: string): boolean {
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

export function maskPan(pan: string): string {
  if (pan.length < 6) return '****';
  return `${pan.slice(0, 5)}****${pan.slice(-1)}`;
}

export function maskAccount(acc: string): string {
  return `****${acc.slice(-4)}`;
}

/** Create a Razorpay Route linked (sub-merchant) account. Returns the acc_ id. */
export async function createLinkedAccount(input: {
  email: string; name: string; pan: string; bankAccount: string; ifsc: string; businessType: string;
}): Promise<{ linkedAccountId: string }> {
  // Razorpay Accounts API (v2). Real call; mocked in integration tests.
  const acc = await razorpayClient().accounts.create({
    type: 'route',
    legal_business_name: input.name,
    business_type: input.businessType,
    contact_name: input.name,
    email: input.email,
    profile: { category: 'education', subcategory: 'others' },
    legal_info: { pan: input.pan },
  });
  return { linkedAccountId: acc.id };
}

/** Create an order with a Route transfer to the organizer's linked account. */
export async function createOrderWithTransfer(input: {
  amountPaise: number; receipt: string; linkedAccountId: string; organizerNetPaise: number;
}): Promise<{ orderId: string }> {
  const order = await razorpayClient().orders.create({
    amount: input.amountPaise,
    currency: 'INR',
    receipt: input.receipt,
    transfers: [{
      account: input.linkedAccountId,
      amount: input.organizerNetPaise,
      currency: 'INR',
      on_hold: false,
    }],
  });
  return { orderId: order.id };
}

/** Issue a refund against a captured payment. Amount in paise. */
export async function createRefund(paymentId: string, amountPaise: number): Promise<{ refundId: string }> {
  const refund = await (razorpayClient() as any).payments.refund(paymentId, {
    amount: amountPaise,
    speed: 'normal',
  });
  return { refundId: refund.id };
}
