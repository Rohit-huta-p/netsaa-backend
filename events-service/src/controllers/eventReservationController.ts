import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import Event from '../models/Event';
import EventReservation from '../models/EventReservation';
import UserPayoutAccount from '../models/UserPayoutAccount';
import { createOrderWithTransfer } from '../services/razorpay';
import { computeFeesPaise } from '../utils/eventFees';
import { slotsLeftForEvent } from '../services/waitlistService';

const RESERVATION_TTL_MS = 10 * 60 * 1000;

// @desc    Reserve tickets for an event (Razorpay order + Route transfer)
// @route   POST /v1/events/:id/reserve
// @access  Private
export const reserveTickets = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id || req.user?._id;
    const idempotencyKey = (req.header('Idempotency-Key') || '').trim();
    if (!idempotencyKey) return res.status(400).json({ meta: { status: 400, message: 'Idempotency-Key header required' }, data: null, errors: [] });

    const existing = await EventReservation.findOne({ idempotencyKey });
    if (existing) {
      return res.status(201).json({ meta: { status: 201, message: 'Reservation (replay)' }, data: { reservationId: existing._id, razorpayOrderId: existing.razorpayOrderId, amountPaise: Math.round(existing.totalAmount * 100) }, errors: [] });
    }

    const event = await Event.findById(req.params.id);
    if (!event || event.status !== 'live') return res.status(409).json({ meta: { status: 409, message: 'Event not open' }, data: null, errors: [] });
    if (event.registrationDeadline && Date.now() > new Date(event.registrationDeadline).getTime()) return res.status(409).json({ meta: { status: 409, message: 'Registration closed' }, data: null, errors: [] });

    const quantity = Math.max(1, Math.min(event.maxGuestsPerRegistration || 5, req.body.quantity || 1));

    // Capacity gate (counts active registrations; held reservations are a Sprint 8 hardening note).
    const slotsLeft = await slotsLeftForEvent(event._id);
    if (slotsLeft < quantity) {
      return res.status(409).json({ meta: { status: 409, message: 'Event is full' }, data: { full: true, waitlistAvailable: !!event.allowWaitlist }, errors: [] });
    }

    const fees = computeFeesPaise(event.ticketPrice * 100, quantity);

    // Organizer must be verified to receive Route transfers
    const payout = await UserPayoutAccount.findOne({ userId: event.organizerId, status: 'verified' });
    if (!payout?.linkedAccountId) return res.status(409).json({ meta: { status: 409, message: 'Organizer payout not set up' }, data: null, errors: [] });

    const { orderId } = await createOrderWithTransfer({
      amountPaise: fees.customerPaysPaise,
      receipt: `evt_${event._id}_${idempotencyKey}`,
      linkedAccountId: payout.linkedAccountId,
      organizerNetPaise: fees.organizerNetPaise,
    });

    const reservation = await EventReservation.create({
      eventId: event._id, userId, quantity,
      totalAmount: fees.customerPaysPaise / 100,
      status: 'reserved',
      expiresAt: new Date(Date.now() + RESERVATION_TTL_MS),
      razorpayOrderId: orderId,
      idempotencyKey,
    });

    return res.status(201).json({ meta: { status: 201, message: 'Reserved' }, data: { reservationId: reservation._id, razorpayOrderId: orderId, amountPaise: fees.customerPaysPaise }, errors: [] });
  } catch (err) {
    return res.status(400).json({ meta: { status: 400, message: 'Reservation failed' }, data: null, errors: [{ message: (err as Error).message }] });
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
