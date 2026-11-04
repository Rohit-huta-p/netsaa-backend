import cron, { ScheduledTask } from 'node-cron';
import Refund from '../models/Refund';
import { payments } from '../services/payments';
import { paiseToRupees } from '../services/payments/types';

const MAX_RETRIES = 3;
const CRON_SCHEDULE = '*/5 * * * *'; // Every 5 minutes
let isRunning = false;

/** A synchronous terminal "done" from the provider (Cashfree dev/instant, Razorpay adapter). */
function isTerminalSuccess(status: string): boolean {
  return /^(processed|success|succeeded)$/i.test(status);
}

/**
 * Submit every refund that has no provider refund id yet (pending or retryable failed) through
 * the provider abstraction (`payments.createRefund`). Provider-neutral:
 *  - Cashfree refunds by `order_id` (held on the Refund as `razorpayOrderId`); amount in RUPEES.
 *  - Razorpay (rollback) refunds by `paymentId`.
 * The refund id is derived from the Mongo _id (`rf_<id>`), so a retry re-sends the SAME id and the
 * provider dedupes it. A synchronous terminal success is marked `processed` immediately; an async
 * PENDING stays `pending` until the provider's REFUND_STATUS webhook confirms it.
 */
export async function processPendingRefunds(): Promise<void> {
  const due = await Refund.find({
    razorpayRefundId: { $exists: false },
    status: { $in: ['pending', 'failed'] },
    retryCount: { $lt: MAX_RETRIES },
  });

  for (const refund of due) {
    try {
      const result = await payments.createRefund({
        orderId: refund.razorpayOrderId || '',
        paymentId: refund.razorpayPaymentId,
        amountRupees: paiseToRupees(refund.refundAmountPaise),
        refundId: `rf_${String(refund._id)}`,
      });
      refund.razorpayRefundId = result.refundId; // holds the provider/merchant refund id
      if (isTerminalSuccess(result.status)) {
        refund.status = 'processed';
        refund.processedAt = new Date();
      }
      // else: stays 'pending' until the REFUND_STATUS webhook confirms it
      await refund.save();
    } catch (err) {
      refund.retryCount += 1;
      refund.lastErrorMessage = (err as Error).message;
      refund.status = refund.retryCount >= MAX_RETRIES ? 'manual_required' : 'failed';
      refund.failedAt = new Date();
      await refund.save();
    }
  }
}

async function run(): Promise<void> {
  if (isRunning) return; // guard against overlapping ticks
  isRunning = true;
  try {
    await processPendingRefunds();
  } catch (error) {
    console.error('[RefundRetryWorker] Error submitting pending refunds:', error);
  } finally {
    isRunning = false;
  }
}

export function startRefundRetryWorker(): ScheduledTask {
  console.log('[RefundRetryWorker] Starting — runs every 5 min');
  const task = cron.schedule(CRON_SCHEDULE, run);
  run(); // clear any backlog on startup
  return task;
}
