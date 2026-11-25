// Events payment MOCK switch — the single source of truth for "fake every Cashfree call and
// collect no real money". Two env vars enable it, with identical effect:
//
//   EVENTS_PAYMENTS_MOCK=1   A deliberate PRODUCTION switch. Turn it on in prod to let paid
//                            event registration complete end-to-end through the mock (faked
//                            provider responses + the /dev-confirm endpoint) while Cashfree is
//                            not yet live-activated. No real order, charge, split, refund or
//                            payout is ever created. Flip it OFF to go live once Cashfree is
//                            activated.
//   CASHFREE_DEV_MODE=1      The original dev / CI / no-credentials flag. Kept working so the
//                            existing unit tests and local setups are unaffected.
//
// This is a LEAF module with no imports, so the gate sites (payments/cashfree.ts,
// payments/cashfreeVerification.ts, controllers/eventReservationController.ts) can read it
// without creating an import cycle through payments/index.ts (index imports ./cashfree, so a
// helper living in index and called at cashfree.ts's top-level `const DEV` would be undefined
// at module-load time and crash the service at boot).
export const paymentsMockEnabled = (): boolean =>
  process.env.CASHFREE_DEV_MODE === '1' || process.env.EVENTS_PAYMENTS_MOCK === '1';
