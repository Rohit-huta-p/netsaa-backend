import { Request, Response } from 'express';
import mongoose from 'mongoose';
import EventReservation from '../models/EventReservation';
import EventTicketType from '../models/EventTicketType';
import EventRegistration from '../models/EventRegistration';
import Event from '../models/Event';

// Configuration
const RESERVATION_TTL_MINUTES = 10;

/**
 * Reserve tickets for an event.
 * Checks availability by counting:
 * 1. Confirmed registrations
 * 2. Active reservations (status='reserved' AND expiresAt > now)
 */
// @desc    Reserve tickets for an event
// @route   POST /api/grow/events/:id/reserve
// @access  Private
export const reserveTickets = async (req: Request, res: Response) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { id: eventId } = req.params;
        const { ticketTypeId, quantity } = req.body;
        const userId = (req as any).user.id;

        if (!quantity || quantity <= 0) {
            throw new Error('Invalid quantity');
        }

        const now = new Date();
        let price = 0;
        let limit = 0;

        // Fetch Event first to check basic status
        const event = await Event.findById(eventId).session(session);
        if (!event) {
            throw new Error('Event not found');
        }

        // Logic Branch: Ticket Type vs. Event Level
        // If ticketTypeId is provided, use Ticketed Flow; otherwise Fixed Price Flow.

        if (ticketTypeId) {
            // --- TICKETED FLOW ---

            // 1. Fetch Ticket Type
            const ticketType = await EventTicketType.findOne({ _id: ticketTypeId, eventId }).session(session);
            if (!ticketType) {
                throw new Error('Ticket type not found');
            }

            // 2. Validate Sales Window
            if (now < ticketType.salesStartAt || now > ticketType.salesEndAt) {
                throw new Error('Ticket sales are not active (within sales window)');
            }

            price = ticketType.price;
            limit = ticketType.capacity;

            // 3. Count Confirmed Registrations for this Ticket Type
            const confirmedCount = await EventRegistration.countDocuments({
                ticketTypeId,
                status: 'registered'
            }).session(session);

            // 4. Count Active Reservations for this Ticket Type
            // Active = status 'reserved' AND expiration time > now
            const activeReservations = await EventReservation.aggregate([
                {
                    $match: {
                        ticketTypeId: new mongoose.Types.ObjectId(ticketTypeId),
                        status: 'reserved',
                        expiresAt: { $gt: now }
                    }
                },
                {
                    $group: {
                        _id: null,
                        totalReserved: { $sum: '$quantity' }
                    }
                }
            ]).session(session);

            const reservedCount = activeReservations[0]?.totalReserved || 0;

            if (confirmedCount + reservedCount + quantity > limit) {
                throw new Error(`Not enough tickets available. Remaining: ${Math.max(0, limit - (confirmedCount + reservedCount))}`);
            }

        } else {
            // --- FIXED PRICE FLOW ---

            // 1. Validate Event Status
            if (event.status !== 'published') {
                throw new Error('Event is not published for registration.');
            }

            // 2. Check Registration Deadline (if exists)
            if (event.registrationDeadline && now > event.registrationDeadline) {
                throw new Error('Registration deadline has passed');
            }

            // 3. Use Event Price & Capacity
            price = event.ticketPrice;
            limit = event.maxParticipants;

            // 4. Count ALL Confirmed Registrations for this Event
            const confirmedCount = await EventRegistration.countDocuments({
                eventId,
                status: 'registered'
            }).session(session);

            // 5. Count ALL Active Reservations for this Event
            const activeReservations = await EventReservation.aggregate([
                {
                    $match: {
                        eventId: new mongoose.Types.ObjectId(eventId),
                        status: 'reserved',
                        expiresAt: { $gt: now }
                    }
                },
                {
                    $group: {
                        _id: null,
                        totalReserved: { $sum: '$quantity' }
                    }
                }
            ]).session(session);

            const reservedCount = activeReservations[0]?.totalReserved || 0;

            if (confirmedCount + reservedCount + quantity > limit) {
                throw new Error('Event is fully booked');
            }
        }

        // 6. Create Reservation
        // Set Expiry: 10 minutes from now
        const expiresAt = new Date(now.getTime() + RESERVATION_TTL_MINUTES * 60000);
        const totalAmount = price * quantity;

        const [reservation] = await EventReservation.create(
            [
                {
                    eventId,
                    ticketTypeId: ticketTypeId || undefined, // undefined if fixed price
                    userId,
                    quantity,
                    totalAmount,
                    status: 'reserved',
                    expiresAt,
                },
            ],
            { session }
        );

        await session.commitTransaction();

        res.status(201).json({
            success: true,
            data: reservation,
            message: 'Tickets reserved successfully',
        });
    } catch (error: any) {
        await session.abortTransaction();
        res.status(400).json({ success: false, message: error.message });
    } finally {
        session.endSession();
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
