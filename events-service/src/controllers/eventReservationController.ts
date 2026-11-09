import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import Event from '../models/Event';
import EventReservation from '../models/EventReservation';
import UserPayoutAccount from '../models/UserPayoutAccount';
import { payments, paiseToRupees, providerOrderId } from '../services/payments';
import { computeFeesPaise } from '../utils/eventFees';
import { resolveEffectivePrice } from '../services/offerPricing';
import { seatsUsedByOffer } from '../services/offerAvailability';
import { slotsLeftForEvent, seatsLeftForSpot } from '../services/waitlistService';
import { resolveSpot } from '../utils/eventSpots';
import { buildRegistrationAnswers } from '../utils/registrationAnswers';
import { consentFromRequest, recordEventRegistrationConsent } from '../utils/consent';
import { confirmReservationPaid } from '../utils/confirmReservationPaid';

const RESERVATION_TTL_MS = 10 * 60 * 1000;

// @desc    Reserve tickets for an event (Cashfree order + Easy Split)
// @route   POST /v1/events/:id/reserve
// @access  Private
export const reserveTickets = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id || req.user?._id;
    const idempotencyKey = (req.header('Idempotency-Key') || '').trim();
    if (!idempotencyKey) return res.status(400).json({ meta: { status: 400, message: 'Idempotency-Key header required' }, data: null, errors: [] });

    const existing = await EventReservation.findOne({ idempotencyKey });
    if (existing) {
      return res.status(201).json({ meta: { status: 201, message: 'Reservation (replay)' }, data: { reservationId: existing._id, orderId: existing.razorpayOrderId, razorpayOrderId: existing.razorpayOrderId, paymentSessionId: existing.paymentSessionId, amountPaise: Math.round(existing.totalAmount * 100) }, errors: [] });
    }

    const event = await Event.findById(req.params.id);
    if (!event || event.status !== 'live') return res.status(409).json({ meta: { status: 409, message: 'Event not open' }, data: null, errors: [] });
    if (event.registrationDeadline && Date.now() > new Date(event.registrationDeadline).getTime()) return res.status(409).json({ meta: { status: 409, message: 'Registration closed' }, data: null, errors: [] });

    // Host can manually close RSVPs without cancelling the event.
    if (event.registrationClosed) {
      return res.status(409).json({ meta: { status: 409, message: 'Registration is closed' }, data: { closed: true }, errors: [{ message: 'Host closed registration' }] });
    }

    const quantity = Math.max(1, Math.min(event.maxGuestsPerRegistration || 5, req.body.quantity || 1));

    // Custom-question answers: validate against the event's questions + enforce required
    // (carried on the reservation; copied onto the paid Registration by the webhook).
    const { answers, error: answersError } = buildRegistrationAnswers(event, req.body.answers);
    if (answersError) {
      return res.status(400).json({ meta: { status: 400, message: 'Invalid answers' }, data: null, errors: [{ message: answersError }] });
    }

    // Attendee names/phones (primary + any guests) so the paid ticket + roster carry the real name
    // instead of "Guest". Kept to entries that have both fields (the schema requires them), capped at
    // quantity. Mirrors the free-RSVP register path; absent for older clients → "Guest" fallback.
    const attendees = (Array.isArray(req.body.attendees) ? req.body.attendees : [])
      .filter((a: any) => a && typeof a.fullName === 'string' && a.fullName.trim() && a.phone)
      .slice(0, quantity)
      .map((a: any) => ({ fullName: String(a.fullName).trim().slice(0, 120), phone: String(a.phone).trim().slice(0, 20) }));

    // Spot/tier selection (gap §6a-b): resolve which spot to buy. A multi-spot event must
    // send a spotId; a single-spot / spot-less event keeps the event-level price.
    const spotRes = resolveSpot(event, req.body.spotId);
    if (spotRes.error) {
      return res.status(400).json({ meta: { status: 400, message: 'Invalid spot' }, data: null, errors: [{ message: spotRes.error }] });
    }
    // Per-ticket price = the best active offer the buyer qualifies for (Early-bird / group),
    // else the base spot/event price. Resolved authoritatively here and LOCKED on the
    // reservation so an offer that later expires can't change what the webhook charges.
    const offerUsage = await seatsUsedByOffer(event._id);
    const effective = resolveEffectivePrice(event, { spotId: spotRes.spot?._id, seats: quantity, seatsUsedByOffer: offerUsage });
    const unitPriceRupees = effective.unitRupees;

    // Capacity gate: per-spot when a spot is chosen, else event-level (held reservations
    // are a Sprint 8 hardening note either way).
    if (spotRes.spot) {
      const spotLeft = await seatsLeftForSpot(event, spotRes.spot._id);
      if (spotLeft < quantity) {
        return res.status(409).json({ meta: { status: 409, message: 'This option is full' }, data: { full: true, spotId: String(spotRes.spot._id), waitlistAvailable: !!event.allowWaitlist }, errors: [] });
      }
    } else {
      const slotsLeft = await slotsLeftForEvent(event._id);
      if (slotsLeft < quantity) {
        return res.status(409).json({ meta: { status: 409, message: 'Event is full' }, data: { full: true, waitlistAvailable: !!event.allowWaitlist }, errors: [] });
      }
    }

    const fees = computeFeesPaise(unitPriceRupees * 100, quantity);

    // Organizer must be verified to receive Route transfers
    const payout = await UserPayoutAccount.findOne({ userId: event.organizerId, status: 'verified' });
    if (!payout?.linkedAccountId) return res.status(409).json({ meta: { status: 409, message: 'Organizer payout not set up' }, data: null, errors: [] });

    // Cashfree order with a static Easy Split: the organizer's share is split on capture,
    // NETSA keeps the remainder. Amounts cross to the provider in RUPEES (internal = paise).
    const seedOrderId = providerOrderId('evt', idempotencyKey);
    const { orderId, paymentSessionId } = await payments.createOrderWithSplit({
      orderId: seedOrderId,
      amountRupees: paiseToRupees(fees.customerPaysPaise),
      // TODO(prod): source the attendee's real phone (JWT carries only id/role). Cashfree
      // needs a customer_phone; placeholder is fine for sandbox.
      customer: { id: String(userId), phone: (req.user as any)?.phone || '9999999999' },
      vendorId: payout.linkedAccountId,
      vendorAmountRupees: paiseToRupees(fees.organizerNetPaise),
      notes: { eventId: String(event._id), kind: 'event_reserve' },
    });

    const reservation = await EventReservation.create({
      eventId: event._id, userId, quantity,
      spotId: spotRes.spot?._id,
      unitPriceRupees, appliedOffer: effective.appliedOffer,
      answers: answers.length ? answers : undefined,
      attendees: attendees.length ? attendees : undefined,
      totalAmount: fees.customerPaysPaise / 100,
      status: 'reserved',
      expiresAt: new Date(Date.now() + RESERVATION_TTL_MS),
      razorpayOrderId: orderId,
      paymentSessionId,
      idempotencyKey,
    });

    // DPDP consent (gap §6a-f): captured at the consent screen before reserve; persisted
    // here (non-fatal) since the paid Registration is created later by the webhook (no req).
    const consent = consentFromRequest(req);
    if (consent.accepted) await recordEventRegistrationConsent(userId, consent);

    return res.status(201).json({ meta: { status: 201, message: 'Reserved' }, data: { reservationId: reservation._id, orderId, razorpayOrderId: orderId, paymentSessionId, amountPaise: fees.customerPaysPaise }, errors: [] });
  } catch (err) {
    return res.status(400).json({ meta: { status: 400, message: 'Reservation failed' }, data: null, errors: [{ message: (err as Error).message }] });
  }
};

// @desc    DEV-ONLY: confirm a reserved hold as paid without a real Cashfree charge.
// @route   POST /v1/reservations/:orderId/dev-confirm
// @access  Private (attendee confirming their own hold)
//
// In CASHFREE_DEV_MODE the provider returns a fake `session_dev_…` payment session and no real
// Cashfree order exists, so the checkout UI can't load and no webhook ever fires. This endpoint
// stands in for that webhook: it runs the EXACT same confirmReservationPaid path (create-new and
// pay-after-approval branches, ticket issue, price-locking) so the full registration completes
// end-to-end. Gated on CASHFREE_DEV_MODE → a plain 404 in production, and it never touches money.
export const devConfirmReservation = async (req: AuthRequest, res: Response) => {
  if (process.env.CASHFREE_DEV_MODE !== '1') {
    return res.status(404).json({ meta: { status: 404, message: 'Not found' }, data: null, errors: [] });
  }
  try {
    const userId = req.user?.id || req.user?._id;
    const orderId = req.params.orderId;
    // Match the webhook's lookup key (razorpayOrderId) + scope to the caller's own hold.
    const reservation = await EventReservation.findOne({ razorpayOrderId: orderId, userId });
    if (!reservation) {
      return res.status(404).json({ meta: { status: 404, message: 'Reservation not found' }, data: null, errors: [] });
    }
    const message = await confirmReservationPaid(reservation, { paymentId: `dev_pay_${Date.now()}`, orderId });
    return res.status(200).json({ meta: { status: 200, message }, data: { reservationId: reservation._id, paymentStatus: 'completed' }, errors: [] });
  } catch (err) {
    return res.status(400).json({ meta: { status: 400, message: 'Dev confirm failed' }, data: null, errors: [{ message: (err as Error).message }] });
  }
};

/**
 * Cancel a reservation (Release tickets manually).
 */
export const cancelReservation = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const userId = (req as any).user.id;

        const reservation = await EventReservation.findOne({ _id: id, userId });
        if (!reservation) {
            return res.status(404).json({ success: false, message: 'Reservation not found' });
        }

        if (reservation.status !== 'reserved') {
            return res.status(400).json({ success: false, message: 'Reservation cannot be cancelled' });
        }

        reservation.status = 'released';
        await reservation.save();

        res.status(200).json({ success: true, message: 'Reservation cancelled' });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
}
