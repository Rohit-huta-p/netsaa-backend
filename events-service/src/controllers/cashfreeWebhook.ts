import { Request, Response } from 'express';
import EventReservation from '../models/EventReservation';
import Refund from '../models/Refund';
import EventNotification from '../models/EventNotification';
import { cashfreeProvider } from '../services/payments/cashfree';
import { confirmReservationPaid } from '../utils/confirmReservationPaid';

// Mounted with express.raw() in server.ts — signature verification needs the exact bytes.
// Always verifies as Cashfree (not the selected provider): this endpoint only receives
// Cashfree events. Payload shapes follow Cashfree's documented webhook schema; confirm the
// exact field nesting against a sandbox webhook before go-live.

const ok = (res: Response, message: string) =>
  res.status(200).json({ meta: { status: 200, message }, data: null, errors: [] });

export const handleCashfreeWebhook = async (req: Request, res: Response) => {
  const signature = req.header('x-webhook-signature') || '';
  const timestamp = req.header('x-webhook-timestamp') || '';
  const rawBody = (req.body as Buffer).toString('utf8');

  if (!cashfreeProvider.verifyWebhookSignature(rawBody, signature, timestamp)) {
    return res.status(401).json({ meta: { status: 401, message: 'Invalid signature' }, data: null, errors: [] });
  }

  let evt: any;
  try { evt = JSON.parse(rawBody); } catch { return ok(res, 'Unparseable (ignored)'); }
  const type: string = evt.type || evt.event || '';

  try {
    switch (type) {
      case 'PAYMENT_SUCCESS_WEBHOOK': {
        const order = evt.data?.order || {};
        const pay = evt.data?.payment || {};
        const orderId: string = order.order_id;
        const paymentId = String(pay.cf_payment_id ?? pay.payment_id ?? '');
        if (!orderId) return ok(res, 'No order id (ignored)');
        const reservation = await EventReservation.findOne({ razorpayOrderId: orderId });
        if (!reservation) return ok(res, 'No reservation (ignored)');
        const message = await confirmReservationPaid(reservation, { paymentId, orderId });
        return ok(res, message);
      }

      case 'PAYMENT_FAILED_WEBHOOK':
      case 'PAYMENT_USER_DROPPED_WEBHOOK':
        // Keep the hold for retry within the TTL; the expiry sweeper releases it if it lapses.
        return ok(res, 'Acknowledged — hold kept for retry');

      case 'REFUND_STATUS_WEBHOOK': {
        const r = evt.data?.refund || {};
        const cfRefundId = String(r.cf_refund_id ?? r.refund_id ?? '');
        const status = String(r.refund_status ?? '').toUpperCase();
        if (!cfRefundId) return ok(res, 'No refund id (ignored)');
        if (status === 'SUCCESS') {
          const refund = await Refund.findOneAndUpdate(
            { razorpayRefundId: cfRefundId },
            { status: 'processed', processedAt: new Date() },
            { new: true },
          );
          if (refund) {
            try {
              await EventNotification.create({
                eventId: refund.eventId, kind: 'refund_processed', channels: ['push', 'email'],
                audience: 'custom', customAudienceUserIds: [refund.userId],
                body: `Your refund has been processed.`, scheduledAt: new Date(), status: 'queued',
              });
            } catch { /* non-fatal */ }
          }
          return ok(res, 'Refund processed');
        }
        if (status === 'FAILED' || status === 'CANCELLED' || status === 'REJECTED') {
          await Refund.findOneAndUpdate(
            { razorpayRefundId: cfRefundId },
            { status: 'failed', failedAt: new Date(), $inc: { retryCount: 1 } },
          );
          return ok(res, 'Refund failed');
        }
        return ok(res, 'Refund status noted');
      }

      default:
        return ok(res, 'Ignored');
    }
  } catch (err) {
    // 500 so Cashfree retries on a genuine processing error.
    return res.status(500).json({ meta: { status: 500, message: 'Processing error' }, data: null, errors: [{ message: (err as Error).message }] });
  }
};
