import { Request, Response, NextFunction } from 'express';
import EventRegistration from '../models/EventRegistration';
import EventTicket from '../models/EventTicket';
import Event from '../models/Event';
import { AuthRequest } from '../middleware/auth';
import { findOrCreateRegistration } from '../utils/idempotency';
import { generateTicketCode, generateBackupCode } from '../utils/ticketCode';
import { slotsLeftForEvent } from '../services/waitlistService';

// @desc    Register for an event (free RSVP path; paid path is Sprint 2)
// @route   POST /v1/events/:id/register
// @access  Private
export const registerForEvent = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const user = (req as AuthRequest).user;
        const userId = user?.id || user?._id;
        if (!userId) {
            return res.status(401).json({ meta: { status: 401, message: 'Not authorized' }, data: null, errors: [{ message: 'Login required' }] });
        }

        const idempotencyKey = (req.header('Idempotency-Key') || '').trim();
        if (!idempotencyKey) {
            return res.status(400).json({ meta: { status: 400, message: 'Idempotency-Key header required' }, data: null, errors: [{ message: 'Missing Idempotency-Key' }] });
        }

        const event = await Event.findById(req.params.id);
        if (!event) {
            return res.status(404).json({ meta: { status: 404, message: 'Event not found' }, data: null, errors: [{ message: 'Event not found' }] });
        }
        if (event.status !== 'live') {
            return res.status(409).json({ meta: { status: 409, message: 'Event is not open for registration' }, data: null, errors: [{ message: 'Not live' }] });
        }
        if (event.registrationDeadline && Date.now() > new Date(event.registrationDeadline).getTime()) {
            return res.status(409).json({ meta: { status: 409, message: 'Registration is closed' }, data: null, errors: [{ message: 'Deadline passed' }] });
        }

        const { quantity = 1, attendees = [] } = req.body;

        // Idempotent per user: the unique (eventId, userId) index allows only ONE registration
        // per event. A non-cancelled prior is a no-op (return it). A cancelled prior, or no prior,
        // ADDS a seat → enforce capacity first (full → 409, the client routes to the waitlist).
        const prior = await EventRegistration.findOne({ eventId: event._id, userId });
        if (prior && prior.status !== 'cancelled') {
            return res.status(200).json({ meta: { status: 200, message: 'Already registered' }, data: prior, errors: [] });
        }

        const slotsLeft = await slotsLeftForEvent(event._id);
        if (slotsLeft < quantity) {
            return res.status(409).json({ meta: { status: 409, message: 'Event is full' }, data: { full: true, waitlistAvailable: !!event.allowWaitlist }, errors: [{ message: 'No seats left' }] });
        }

        if (prior) {
            // cancelled → reactivate (re-RSVP after leaving)
            prior.status = 'registered';
            prior.cancelledAt = undefined;
            prior.cancelledBy = undefined;
            prior.cancellationReason = undefined;
            if (quantity) prior.quantity = quantity;
            await prior.save();
            const existingTickets = await EventTicket.countDocuments({ registrationId: prior._id });
            if (existingTickets === 0) {
                const reissued = Array.from({ length: prior.quantity || 1 }).map((_, i) => ({
                    ticketId: `${prior._id}-${i}`,
                    eventId: event._id,
                    registrationId: prior._id,
                    userId,
                    attendeeName: attendees[i]?.fullName || attendees[0]?.fullName || 'Guest',
                    qrCode: `${generateTicketCode(event.title)}|${generateBackupCode()}`,
                    status: 'issued',
                }));
                await EventTicket.insertMany(reissued);
            }
            return res.status(200).json({ meta: { status: 200, message: 'Re-registered' }, data: prior, errors: [] });
        }

        const { registration, created } = await findOrCreateRegistration(idempotencyKey, {
            eventId: event._id,
            userId,
            quantity,
            attendees,
            source: 'standard',
            visibility: 'public',
        });

        if (created) {
            const ticketDocs = Array.from({ length: quantity }).map((_, i) => ({
                ticketId: `${registration._id}-${i}`,
                eventId: event._id,
                registrationId: registration._id,
                userId,
                attendeeName: attendees[i]?.fullName || attendees[0]?.fullName || 'Guest',
                qrCode: `${generateTicketCode(event.title)}|${generateBackupCode()}`,
                status: 'issued',
            }));
            await EventTicket.insertMany(ticketDocs);
        }

        return res.status(201).json({ meta: { status: 201, message: 'Registered successfully' }, data: registration, errors: [] });
    } catch (err) {
        return res.status(400).json({ meta: { status: 400, message: 'Validation Error' }, data: null, errors: [{ message: (err as Error).message }] });
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

// @desc Current user's active registration for an event (probe for CTA/receipt/ticket)
// @route GET /v1/events/:id/registrations/me
// @access Private
export const getMyRegistration = async (req: Request, res: Response) => {
    try {
        const user = (req as AuthRequest).user;
        const userId = user?.id || user?._id;
        const registration = await EventRegistration.findOne({
            eventId: req.params.id,
            userId,
            status: { $ne: 'cancelled' },
        }).lean();
        if (!registration) {
            return res.status(404).json({ meta: { status: 404, message: 'Not registered' }, data: null, errors: [] });
        }
        const ticket = await EventTicket.findOne({ registrationId: registration._id }).select('qrCode status').lean();
        const [ticketCode, backupCode] = ((ticket as any)?.qrCode || '|').split('|');
        return res.status(200).json({
            meta: { status: 200, message: 'OK' },
            data: {
                ...registration,
                ticketCode,
                backupCode,
                // Frontend reads attendeeCount + flat payment fields; the doc stores quantity + nested paymentRecord.
                attendeeCount: registration.quantity,
                razorpayPaymentId: registration.paymentRecord?.razorpayPaymentId,
                paymentCapturedAt: registration.paymentRecord?.capturedAt,
                ticketAmount: registration.paymentRecord ? (registration.paymentRecord.amountPaise - registration.paymentRecord.serviceFeePaise) / 100 : undefined,
                serviceFeeAmount: registration.paymentRecord ? registration.paymentRecord.serviceFeePaise / 100 : undefined,
                paidAmount: registration.paymentRecord ? registration.paymentRecord.amountPaise / 100 : undefined,
            },
            errors: [],
        });
    } catch (err) {
        return res.status(500).json({ meta: { status: 500, message: 'Server Error' }, data: null, errors: [{ message: (err as Error).message }] });
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

// @desc    Organizer roster — non-cancelled attendees for an event (name + status)
// @route   GET /v1/events/:id/roster
// @access  Private
export const getEventRoster = async (req: Request, res: Response) => {
    try {
        const regs = await EventRegistration.find({ eventId: req.params.id, status: { $ne: 'cancelled' } })
            .populate('userId', 'displayName')
            .sort({ registeredAt: -1 })
            .lean();
        const rows = regs.map((r: any) => ({
            _id: String(r._id),
            userId: String(r.userId?._id || r.userId || ''),
            name: r.attendees?.[0]?.fullName || r.userId?.displayName || 'Guest',
            city: r.attendees?.[0]?.city,
            registeredAt: r.registeredAt,
            status: r.status,
            visibility: r.visibility,
        }));
        return res.status(200).json({ meta: { status: 200, message: 'OK' }, data: { rows, total: rows.length }, errors: [] });
    } catch (err) {
        return res.status(500).json({ meta: { status: 500, message: 'Server Error' }, data: null, errors: [{ message: (err as Error).message }] });
    }
};
