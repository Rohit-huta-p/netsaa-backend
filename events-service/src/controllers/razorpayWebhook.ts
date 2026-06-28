import { Request, Response } from 'express';
import EventReservation from '../models/EventReservation';
import EventRegistration from '../models/EventRegistration';
import EventTicket from '../models/EventTicket';
import Event from '../models/Event';
import Refund from '../models/Refund';
import { verifyWebhookSignature } from '../services/razorpay';
import { computeFeesPaise } from '../utils/eventFees';
import { generateTicketCode, generateBackupCode } from '../utils/ticketCode';

// Requires express.raw() on this route — see server.ts
export const handleWebhook = async (req: Request, res: Response) => {
  const signature = req.header('x-razorpay-signature') || '';
  const rawBody = (req.body as Buffer).toString('utf8');
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET || '';

  if (!verifyWebhookSignature(rawBody, signature, secret)) {
    return res.status(401).json({ meta: { status: 401, message: 'Invalid signature' }, data: null, errors: [] });
  }

  const evt = JSON.parse(rawBody);

  try {
    switch (evt.event) {
      case 'payment.captured': {
        const payment = evt.payload.payment.entity;
        const reservation = await EventReservation.findOne({ razorpayOrderId: payment.order_id });
        if (!reservation) return res.status(200).json({ meta: { status: 200, message: 'No reservation (ignored)' }, data: null, errors: [] });
        if (reservation.status === 'paid') return res.status(200).json({ meta: { status: 200, message: 'Already processed' }, data: null, errors: [] });

        // Idempotency: registration keyed off the reservation's idempotencyKey
        const existing = await EventRegistration.findOne({ idempotencyKey: reservation.idempotencyKey });
        if (existing) {
          reservation.status = 'paid'; await reservation.save();
          return res.status(200).json({ meta: { status: 200, message: 'Already registered' }, data: null, errors: [] });
        }

        const event = await Event.findById(reservation.eventId);
        const fees = computeFeesPaise((event?.ticketPrice || 0) * 100, reservation.quantity);

        const registration = await EventRegistration.create({
          eventId: reservation.eventId, userId: reservation.userId,
          quantity: reservation.quantity, status: 'registered',
          idempotencyKey: reservation.idempotencyKey, source: 'standard', visibility: 'public',
          paymentRecord: {
            razorpayPaymentId: payment.id, razorpayOrderId: payment.order_id, capturedAt: new Date(),
            amountPaise: fees.customerPaysPaise, serviceFeePaise: fees.serviceFeePaise,
            netsaFeePaise: fees.netsaFeePaise, organizerNetPaise: fees.organizerNetPaise,
          },
        });

        const tickets = Array.from({ length: reservation.quantity }).map((_, i) => ({
          ticketId: `${registration._id}-${i}`, eventId: reservation.eventId, registrationId: registration._id,
          userId: reservation.userId, attendeeName: 'Guest',
          qrCode: `${generateTicketCode(event?.title || 'NETSA')}|${generateBackupCode()}`, status: 'issued',
        }));
        await EventTicket.insertMany(tickets);

        reservation.status = 'paid'; await reservation.save();
        return res.status(200).json({ meta: { status: 200, message: 'Registration confirmed' }, data: null, errors: [] });
      }

      case 'payment.failed': {
        // DECISION ① (2026-06-26): do NOT release the reservation here. The attendee may
        // retry with the SAME order within the 10-min TTL (see PaymentRetrySheet, Task 10).
        // Releasing now would contradict the UI's "seats held" promise. The expiry sweeper
        // (Task 6) releases the hold only if the TTL actually lapses. Just acknowledge.
        return res.status(200).json({ meta: { status: 200, message: 'Acknowledged — hold kept for retry' }, data: null, errors: [] });
      }

      case 'refund.processed': {
        const refundEntity = evt.payload.refund.entity;
        await Refund.findOneAndUpdate(
          { razorpayRefundId: refundEntity.id },
          { status: 'processed', processedAt: new Date() },
        );
        return res.status(200).json({ meta: { status: 200, message: 'Refund processed' }, data: null, errors: [] });
      }
      case 'refund.failed': {
        const refundEntity = evt.payload.refund.entity;
        await Refund.findOneAndUpdate(
          { razorpayRefundId: refundEntity.id },
          { status: 'failed', failedAt: new Date(), $inc: { retryCount: 1 } },
        );
        return res.status(200).json({ meta: { status: 200, message: 'Refund failed — will retry' }, data: null, errors: [] });
      }
      case 'order.paid':
        // Acknowledge so Razorpay stops retrying.
        return res.status(200).json({ meta: { status: 200, message: 'Acknowledged' }, data: null, errors: [] });

      default:
        return res.status(200).json({ meta: { status: 200, message: 'Ignored' }, data: null, errors: [] });
    }
  } catch (err) {
    // Return 500 so Razorpay retries on a genuine processing error
    return res.status(500).json({ meta: { status: 500, message: 'Processing error' }, data: null, errors: [{ message: (err as Error).message }] });
  }
};
