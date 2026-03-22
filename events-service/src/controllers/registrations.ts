import { Request, Response, NextFunction } from 'express';
import EventRegistration from '../models/EventRegistration';
import EventTicket from '../models/EventTicket';
import Event from '../models/Event';
import { AuthRequest } from '../middleware/auth';

// @desc    Register for an event
// @route   POST /api/grow/events/:id/register
// @access  Private
export const registerForEvent = async (req: Request, res: Response, next: NextFunction) => {
    try {
        // TODO: Verify ticket availability and process payment (mock for now)
        const { ticketTypeId, quantity, attendeeInfo } = req.body; // Using quantity is tricky if we need individual records
        // Assume quantity=1 for simple registration or loop
        // But schema `event_registrations` is one document per user per event.
        // So likely just creating one registration.

        const registration = await EventRegistration.create({
            eventId: req.params.id,
            userId: req.body.userId, // Should come from auth middleware
            ticketTypeId: `ticketTypeId`,
            status: 'registered',
            ...(attendeeInfo && { attendees: attendeeInfo }),
        });

        res.status(201).json({
            meta: { status: 201, message: 'Registered successfully' },
            data: registration,
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

// @desc    Get registrations for an event
// @route   GET /api/grow/events/:id/registrations
// @access  Private (Organizer)
export const getEventRegistrations = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const page = parseInt(req.query.page as string, 10) || 1;
        const limit = parseInt(req.query.limit as string, 10) || 20;
        const skip = (page - 1) * limit;

        const total = await EventRegistration.countDocuments({ eventId: req.params.id });

        const registrations = await EventRegistration.find({ eventId: req.params.id })
            .populate('userId', 'displayName email phoneNumber') // Populate user details
            .populate('ticketTypeId', 'name price')
            .sort({ registeredAt: -1 })
            .skip(skip)
            .limit(limit);

        res.status(200).json({
            meta: {
                status: 200,
                message: 'OK',
                pagination: {
                    page,
                    limit,
                    total,
                    pages: Math.ceil(total / limit)
                }
            },
            data: registrations,
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

// @desc    Get user's registrations (with tickets)
// @route   GET /api/grow/users/me/event-registrations
// @query   ?status=registered (optional filter)
// @access  Private
export const getUserRegistrations = async (req: Request, res: Response, next: NextFunction) => {
    try {
        console.log("Hello");
        const user = (req as AuthRequest).user;
        const userId = user?.id || user?._id || user?.userId;
        console.log("[getUserRegistrations] UserID: ", userId);

        if (!userId) {
            return res.status(400).json({
                meta: { status: 400, message: 'User ID required' },
                data: null,
                errors: [{ message: 'User ID required' }]
            });
        }

        // Build query — optionally filter by status
        const filter: any = { userId };
        if (req.query.status && typeof req.query.status === 'string') {
            filter.status = req.query.status;
        }
        console.log(`[getUserRegistrations] Querying for userId: ${userId}, token user._id: ${(req as AuthRequest).user?.id}, filter:`, filter);

        const registrations = await EventRegistration.find(filter)
            .populate('eventId', 'title schedule location category registrationDeadline status')
            .populate('ticketTypeId', 'name price')
            .sort({ registeredAt: -1 })
            .lean();
        console.log("[getUserRegistrations] Registrations: ", registrations);
        // Collect all registration IDs to batch-fetch tickets
        const registrationIds = registrations.map((r: any) => r._id);
        const allTickets = await EventTicket.find({ registrationId: { $in: registrationIds } })
            .select('ticketId registrationId attendeeName qrCode status checkedInAt')
            .lean();

        // Group tickets by registrationId
        const ticketsByReg: Record<string, any[]> = {};
        for (const t of allTickets) {
            const key = t.registrationId.toString();
            if (!ticketsByReg[key]) ticketsByReg[key] = [];
            ticketsByReg[key].push(t);
        }

        const formattedRegistrations = registrations.map((reg: any) => ({
            ...reg,
            event: reg.eventId,            // populated event object
            eventId: reg.eventId?._id,      // keep raw ObjectId string
            tickets: ticketsByReg[reg._id.toString()] || [],
        }));

        res.status(200).json({
            meta: { status: 200, message: 'OK' },
            data: formattedRegistrations,
            errors: [],
        });
    } catch (err) {
        console.error('[getUserRegistrations] Error:', err);
        res.status(500).json({
            meta: { status: 500, message: 'Server Error' },
            data: null,
            errors: [{ message: (err as Error).message }],
        });
    }
};

// @desc    Update registration status (Approve/Reject)
// @route   PATCH /api/grow/registrations/:registrationId/status
// @access  Private (Organizer)
export const updateRegistrationStatus = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const { registrationId } = req.params;
        const { status } = req.body; // 'approved', 'rejected', 'checked-in'
        const organizerId = req.user.id;

        const registration = await EventRegistration.findById(registrationId);
        if (!registration) {
            return res.status(404).json({
                meta: { status: 404, message: 'Registration not found' },
                errors: [{ message: 'Registration not found' }]
            });
        }

        const event = await Event.findById(registration.eventId);
        if (!event) {
            return res.status(404).json({
                meta: { status: 404, message: 'Event not found' },
                errors: [{ message: 'Event not found' }]
            });
        }

        if (event.organizerId.toString() !== organizerId) {
            return res.status(403).json({
                meta: { status: 403, message: 'Not authorized' },
                errors: [{ message: 'Not authorized to manage this event' }]
            });
        }

        registration.status = status;
        await registration.save();

        res.status(200).json({
            meta: { status: 200, message: 'Status updated' },
            data: registration,
            errors: []
        });

    } catch (err) {
        res.status(500).json({
            meta: { status: 500, message: 'Server Error' },
            data: null,
            errors: [{ message: (err as Error).message }]
        });
    }
};
