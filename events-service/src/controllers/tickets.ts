import { Request, Response, NextFunction } from 'express';
import EventTicketType from '../models/EventTicketType';

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
