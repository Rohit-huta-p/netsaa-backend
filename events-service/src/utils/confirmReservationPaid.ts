import EventRegistration from '../models/EventRegistration';
import EventTicket from '../models/EventTicket';
import Event from '../models/Event';
import { IEventReservation } from '../models/EventReservation';
import { computeFeesPaise } from './eventFees';
import { generateTicketCode, generateBackupCode } from './ticketCode';

/** Provider-neutral captured-payment facts. `orderId`/`paymentId` are whatever the gateway
 *  returned (Cashfree order_id / cf_payment_id today) — stored on the paymentRecord as-is. */
export interface CapturedPayment {
  paymentId: string;
  orderId: string;
}

/**
 * Confirm a reserved EventReservation as paid. Idempotent and provider-neutral — the webhook
 * controllers (Cashfree today, Razorpay legacy) just parse their own payload into a
 * CapturedPayment and call this. Extracted verbatim from the original Razorpay webhook so the
 * paid-event behavior is identical regardless of gateway.
 *
 * Two paths:
 *  - pay-after-approval (reservation.registrationId set) → flip THAT reg to registered.
 *  - create-new → create the EventRegistration from the reservation.
 * Both write the paymentRecord, issue one ticket per seat (no-op if present), and mark the
 * reservation paid. Returns a short status message for the webhook ack.
 */
export async function confirmReservationPaid(
  reservation: IEventReservation,
  payment: CapturedPayment,
): Promise<string> {
  if (reservation.status === 'paid') return 'Already processed';

  // Pay-after-approval (§6a-e): confirm an ALREADY-approved registration rather than creating
  // one. Runs before the create-by-idempotencyKey path (the approved reg carries its own
  // register-time key, not this hold's `approve-…` key).
  if (reservation.registrationId) {
    const reg = await EventRegistration.findById(reservation.registrationId);
    if (reg && reg.status !== 'registered') {
      const ev = await Event.findById(reservation.eventId);
      const paidSpot = reservation.spotId ? (ev?.spots ?? []).find((s: any) => String(s._id) === String(reservation.spotId)) : undefined;
      const unit = paidSpot ? (paidSpot.price || 0) : (ev?.ticketPrice || 0);
      const f = computeFeesPaise(unit * 100, reservation.quantity);
      reg.status = 'registered';
      reg.paymentRecord = {
        razorpayPaymentId: payment.paymentId, razorpayOrderId: payment.orderId, capturedAt: new Date(),
        amountPaise: f.customerPaysPaise, serviceFeePaise: f.serviceFeePaise,
        netsaFeePaise: f.netsaFeePaise, organizerNetPaise: f.organizerNetPaise,
      };
      await reg.save();
      const have = await EventTicket.countDocuments({ registrationId: reg._id });
      if (have === 0) {
        await EventTicket.insertMany(Array.from({ length: reg.quantity || 1 }).map((_, i) => ({
          ticketId: `${reg._id}-${i}`, eventId: reservation.eventId, registrationId: reg._id,
          userId: reg.userId, attendeeName: reg.attendees?.[i]?.fullName || reg.attendees?.[0]?.fullName || 'Guest',
          qrCode: `${generateTicketCode(ev?.title || 'NETSA')}|${generateBackupCode()}`, status: 'issued',
        })));
      }
    }
    reservation.status = 'paid'; await reservation.save();
    return 'Registration confirmed (approved)';
  }

  // Idempotency: registration keyed off the reservation's idempotencyKey.
  const existing = await EventRegistration.findOne({ idempotencyKey: reservation.idempotencyKey });
  if (existing) {
    reservation.status = 'paid'; await reservation.save();
    return 'Already registered';
  }

  const event = await Event.findById(reservation.eventId);
  const spot = reservation.spotId ? (event?.spots ?? []).find((s: any) => String(s._id) === String(reservation.spotId)) : undefined;
  const unitPriceRupees = spot ? (spot.price || 0) : (event?.ticketPrice || 0);
  const fees = computeFeesPaise(unitPriceRupees * 100, reservation.quantity);

  const registration = await EventRegistration.create({
    eventId: reservation.eventId, userId: reservation.userId,
    quantity: reservation.quantity, status: 'registered',
    spotId: reservation.spotId,
    answers: reservation.answers?.length ? reservation.answers : undefined,
    idempotencyKey: reservation.idempotencyKey, source: 'standard', visibility: 'public',
    paymentRecord: {
      razorpayPaymentId: payment.paymentId, razorpayOrderId: payment.orderId, capturedAt: new Date(),
      amountPaise: fees.customerPaysPaise, serviceFeePaise: fees.serviceFeePaise,
      netsaFeePaise: fees.netsaFeePaise, organizerNetPaise: fees.organizerNetPaise,
    },
  });

  await EventTicket.insertMany(Array.from({ length: reservation.quantity }).map((_, i) => ({
    ticketId: `${registration._id}-${i}`, eventId: reservation.eventId, registrationId: registration._id,
    userId: reservation.userId, attendeeName: 'Guest',
    qrCode: `${generateTicketCode(event?.title || 'NETSA')}|${generateBackupCode()}`, status: 'issued',
  })));

  reservation.status = 'paid'; await reservation.save();
  return 'Registration confirmed';
}
