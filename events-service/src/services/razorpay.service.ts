import Razorpay from 'razorpay';

let clientInstance: Razorpay | null = null;

function getClient(): Razorpay {
    if (!clientInstance) {
        const key_id = process.env.RAZORPAY_KEY_ID;
        const key_secret = process.env.RAZORPAY_KEY_SECRET;
        if (!key_id || !key_secret) {
            throw new Error('RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET env vars are required');
        }
        clientInstance = new Razorpay({ key_id, key_secret });
    }
    return clientInstance;
}

// For tests — lets test file inject a fresh client
export function _resetClient() { clientInstance = null; }

export interface CreateOrderParams {
    amountInRupees: number;
    receiptKey: string;
    notes: Record<string, string | number | undefined>;
    transfers?: TransferConfig[];
}

export interface TransferConfig {
    account: string;
    amount: number;
    currency: 'INR';
    notes?: Record<string, string>;
    on_hold?: 0 | 1;
}

export interface RazorpayOrder {
    id: string;
    amount: number;
    currency: string;
    receipt: string;
    status: string;
}

export interface RazorpayPayment {
    id: string;
    amount: number;
    currency: string;
    status: 'created' | 'authorized' | 'captured' | 'refunded' | 'failed';
    order_id: string;
    method?: string;
    email?: string;
    contact?: string;
}

export async function createEventOrder(params: CreateOrderParams): Promise<RazorpayOrder> {
    const client = getClient();
    const amountPaise = Math.round(params.amountInRupees * 100);

    const stringNotes: Record<string, string> = {};
    for (const [k, v] of Object.entries(params.notes)) {
        if (v !== undefined && v !== null) stringNotes[k] = String(v);
    }

    const orderArgs: any = {
        amount: amountPaise,
        currency: 'INR',
        receipt: params.receiptKey,
        notes: stringNotes,
        payment_capture: 1,
    };
    if (params.transfers && params.transfers.length > 0) {
        orderArgs.transfers = params.transfers;
    }

    const order = await client.orders.create(orderArgs);
    return order as unknown as RazorpayOrder;
}

export async function fetchPayment(paymentId: string): Promise<RazorpayPayment> {
    const client = getClient();
    const payment = await client.payments.fetch(paymentId);
    return payment as unknown as RazorpayPayment;
}

export async function triggerRefund(paymentId: string, amountInRupees?: number) {
    const client = getClient();
    const args: any = { speed: 'normal' };
    if (amountInRupees !== undefined) {
        args.amount = Math.round(amountInRupees * 100);
    }
    return await client.payments.refund(paymentId, args);
}

export function buildRouteTransfer(params: {
    organizerLinkedAccountId?: string;
    grossAmountRupees: number;
    netsaFeePercent: number;
}): TransferConfig[] | undefined {
    if (!params.organizerLinkedAccountId) return undefined;
    const grossPaise = Math.round(params.grossAmountRupees * 100);
    const feePaise = Math.round((grossPaise * params.netsaFeePercent) / 100);
    const organizerPaise = grossPaise - feePaise;
    return [
        {
            account: params.organizerLinkedAccountId,
            amount: organizerPaise,
            currency: 'INR',
            on_hold: 0,
        },
    ];
}
