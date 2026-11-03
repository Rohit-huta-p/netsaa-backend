// Payment provider selector. Controllers import `payments` from here — never a provider
// file directly — so swapping providers is one env var and the call sites never change.
//
//   PAYMENT_PROVIDER=cashfree (default) | razorpay
//   CASHFREE_DEV_MODE=1  → Cashfree calls are faked (no network); for dev/CI/no-creds demos
//
// Cashfree is the finalized provider (events-only money layer); Razorpay is the rollback.

import { cashfreeProvider } from './cashfree';
import { razorpayProvider } from './razorpay';
import type { PaymentProvider } from './types';

export const payments: PaymentProvider =
  (process.env.PAYMENT_PROVIDER || 'cashfree').toLowerCase() === 'razorpay'
    ? razorpayProvider
    : cashfreeProvider;

export * from './types';
