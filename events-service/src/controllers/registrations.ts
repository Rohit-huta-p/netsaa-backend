import { Request, Response, NextFunction } from 'express';
import EventRegistration from '../models/EventRegistration';
import Event from '../models/Event';
import { AuthRequest } from '../middleware/auth';

// @desc    Register for an event
// @route   POST /api/grow/events/:id/register
// @access  Private
export const registerForEvent = async (req: Request, res: Response, next: NextFunction) => {
    try {
        // TODO: Verify ticket availability and process payment (mock for now)
        const { ticketTypeId, quantity } = req.body; // Using quantity is tricky if we need individual records
        // Assume quantity=1 for simple registration or loop
        // But schema `event_registrations` is one document per user per event.
        // So likely just creating one registration.

        const registration = await EventRegistration.create({
            eventId: req.params.id,
            userId: req.body.userId, // Should come from auth middleware
            ticketTypeId: ticketTypeId,
            status: 'registered',
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
        const registrations = await EventRegistration.find({ eventId: req.params.id })
            .populate('userId', 'displayName email phoneNumber') // Populate user details
            .populate('ticketTypeId', 'name price');

        res.status(200).json({
            meta: { status: 200, message: 'OK' },
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

// @desc    Get user's registrations
// @route   GET /api/grow/users/me/event-registrations
// @access  Private
export const getUserRegistrations = async (req: Request, res: Response, next: NextFunction) => {
    try {
        // Assuming req.query.userId or similar for now, usually req.user._id
        const userId = (req as AuthRequest).user.id;
        if (!userId) {
            return res.status(400).json({
                meta: { status: 400, message: 'User ID required' },
                data: null,
                errors: [{ message: 'User ID required' }]
            })
        }

        const registrations = await EventRegistration.find({ userId: userId })
            .populate('eventId', 'title schedule location')
            .populate('ticketTypeId', 'name price')
            .lean();

        const formattedRegistrations = registrations.map((reg: any) => ({
            ...reg,
            eventDetails: reg.eventId,
            eventId: reg.eventId?._id
        }));

        res.status(200).json({
            meta: { status: 200, message: 'OK' },
            data: formattedRegistrations,
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
