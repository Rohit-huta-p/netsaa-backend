import Refund from '../models/Refund';
import { createRefund } from '../services/razorpay';

const MAX_RETRIES = 3;

/** Submit all refunds that have no razorpayRefundId yet (pending or retryable failed). */
export async function processPendingRefunds(): Promise<void> {
  const due = await Refund.find({
    razorpayRefundId: { $exists: false },
    status: { $in: ['pending', 'failed'] },
    retryCount: { $lt: MAX_RETRIES },
  });

  for (const refund of due) {
    try {
      const { refundId } = await createRefund(refund.razorpayPaymentId, refund.refundAmountPaise);
      refund.razorpayRefundId = refundId; // stays 'pending' until refund.processed webhook confirms
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
