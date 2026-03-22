import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import EventTicketType from '../models/EventTicketType';
import EventTicket from '../models/EventTicket';
import Event from '../models/Event';
import { AuthRequest } from '../middleware/auth';

// ─── Check In Ticket ───
// @desc    Check in an event ticket by scanning its ticketId
// @route   POST /api/grow/tickets/checkin
// @access  Private (Organizer of the event only)
export const checkinTicket = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const { ticketId } = req.body;

        // ── Validation ──
        if (!ticketId || typeof ticketId !== 'string' || !ticketId.trim()) {
            console.warn('[checkinTicket] Missing or invalid ticketId in request body');
            return res.status(400).json({
                meta: { status: 400, message: 'Validation Error' },
                data: null,
                errors: [{ message: 'ticketId is required and must be a non-empty string.' }],
            });
        }

        // ── Find ticket ──
        const ticket = await EventTicket.findOne({ ticketId: ticketId.trim() });

        if (!ticket) {
            console.warn(`[checkinTicket] Ticket not found: ${ticketId}`);
            return res.status(404).json({
                meta: { status: 404, message: 'Not Found' },
                data: null,
                errors: [{ message: 'Ticket not found.' }],
            });
        }

        // ── Organizer authorization ──
        const event = await Event.findById(ticket.eventId).select('organizerId').lean();

        if (!event) {
            console.error(`[checkinTicket] Event not found for ticket: ${ticketId}`);
            return res.status(404).json({
                meta: { status: 404, message: 'Not Found' },
                data: null,
                errors: [{ message: 'Associated event not found.' }],
            });
        }

        const requestingUserId = req.user?.id || req.user?._id;
        if (!requestingUserId || event.organizerId.toString() !== requestingUserId.toString()) {
            console.warn(`[checkinTicket] Unauthorized check-in attempt by user ${requestingUserId} for event ${event._id}`);
            return res.status(403).json({
                meta: { status: 403, message: 'Forbidden' },
                data: null,
                errors: [{ message: 'Only the event organizer can check in tickets.' }],
            });
        }

        // ── Duplicate scan guard ──
        if (ticket.status === 'checked_in') {
            console.info(`[checkinTicket] Duplicate scan for ticket: ${ticketId}, already checked in at ${ticket.checkedInAt}`);
            return res.status(409).json({
                meta: { status: 409, message: 'Conflict' },
                data: {
                    ticketId: ticket.ticketId,
                    status: ticket.status,
                    checkedInAt: ticket.checkedInAt,
                },
                errors: [{ message: 'Ticket has already been checked in.' }],
            });
        }

        // ── Cancelled ticket guard ──
        if (ticket.status === 'cancelled') {
            console.warn(`[checkinTicket] Attempted check-in of cancelled ticket: ${ticketId}`);
            return res.status(400).json({
                meta: { status: 400, message: 'Bad Request' },
                data: null,
                errors: [{ message: 'Cannot check in a cancelled ticket.' }],
            });
        }

        // ── Update status ──
        ticket.status = 'checked_in';
        ticket.checkedInAt = new Date();
        await ticket.save();

        console.info(`[checkinTicket] Ticket ${ticketId} checked in successfully at ${ticket.checkedInAt.toISOString()}`);

        return res.status(200).json({
            meta: { status: 200, message: 'Ticket checked in successfully' },
            data: {
                ticketId: ticket.ticketId,
                eventId: ticket.eventId,
                attendeeName: ticket.attendeeName,
                status: ticket.status,
                checkedInAt: ticket.checkedInAt,
            },
            errors: [],
        });
    } catch (err) {
        console.error('[checkinTicket] Unexpected error:', err);
        return res.status(500).json({
            meta: { status: 500, message: 'Server Error' },
            data: null,
            errors: [{ message: (err as Error).message }],
        });
    }
};

// @desc    Add ticket type to event
// @route   POST /api/grow/ticket-types
// @access  Private (Organizer)
export const createTicketType = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const ticketType = await EventTicketType.create(req.body);
        res.status(201).json({
            meta: { status: 201, message: 'Ticket type created' },
            data: ticketType,
            errors: [],
        });
    } catch (err) {
        res.status(400).json({
            meta: { status: 400, message: 'Validation Error' },
            data: null,
            errors: [{ message: (err as Error).message }],
        });
    }
};

// @desc    Get ticket types for an event
// @route   GET /api/grow/events/:id/ticket-types
// @access  Public
export const getTicketTypesByEvent = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const ticketTypes = await EventTicketType.find({ eventId: req.params.id });
        res.status(200).json({
            meta: { status: 200, message: 'OK' },
            data: ticketTypes,
            errors: [],
        });
    } catch (err) {
        res.status(500).json({
            meta: { status: 500, message: 'Server Error' },
            data: null,
            errors: [{ message: (err as Error).message }],
        });
    }
};
