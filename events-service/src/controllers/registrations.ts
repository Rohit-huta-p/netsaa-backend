import { Request, Response, NextFunction } from 'express';
import EventRegistration, { IEventRegistration } from '../models/EventRegistration';
import EventTicket from '../models/EventTicket';
import Event from '../models/Event';
import { AuthRequest } from '../middleware/auth';
import { findOrCreateRegistration } from '../utils/idempotency';
import { resolveSpot } from '../utils/eventSpots';
import { buildRegistrationAnswers } from '../utils/registrationAnswers';
import { buildApplication } from '../utils/registrationApplication';
import { consentFromRequest, recordEventRegistrationConsent } from '../utils/consent';
import { doApprove, doDecline } from './registrationApproval';
import { generateTicketCode, generateBackupCode } from '../utils/ticketCode';
import { slotsLeftForEvent, seatsLeftForSpot } from '../services/waitlistService';
import EventNotification from '../models/EventNotification';
import WaitlistEntry from '../models/WaitlistEntry';

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

        // Approval-gated door (gap §6a-c/d): guest_list / apply events create a `pending`
        // request (no ticket, no seat consumed) that the host approves/declines. Open door
        // registers immediately. Capacity + paid-spot gates are skipped for a pending request —
        // a request may exceed capacity; the host decides (and is capacity-checked) at approval.
        const door = event.registration?.door ?? 'open';
        const requiresApproval = door !== 'open';

        const { quantity = 1, attendees = [] } = req.body;

        // Idempotent per user: the unique (eventId, userId) index allows only ONE registration
        // per event. A non-cancelled prior is a no-op (return it). A cancelled prior, or no prior,
        // ADDS a seat → enforce capacity first (full → 409, the client routes to the waitlist).
        // NOTE: custom-question answers + consent are validated/recorded below, only on the
        // branches that create or reactivate — so an idempotent replay that omits them is never
        // rejected, and a question-less / no-consent request is unaffected (open-door stays open).
        const prior = await EventRegistration.findOne({ eventId: event._id, userId });
        if (prior && prior.status !== 'cancelled') {
            return res.status(200).json({ meta: { status: 200, message: 'Already registered' }, data: prior, errors: [] });
        }

        // Host can manually close RSVPs without cancelling the event.
        // The idempotent early-return above ensures already-registered users are not blocked.
        if (event.registrationClosed) {
            return res.status(409).json({ meta: { status: 409, message: 'Registration is closed' }, data: { closed: true }, errors: [{ message: 'Host closed registration' }] });
        }

        if (!requiresApproval) {
            const slotsLeft = await slotsLeftForEvent(event._id);
            if (slotsLeft < quantity) {
                return res.status(409).json({ meta: { status: 409, message: 'Event is full' }, data: { full: true, waitlistAvailable: !!event.allowWaitlist }, errors: [{ message: 'No seats left' }] });
            }
        }

        // Custom-question answers: validate against the event's questions + enforce required.
        const { answers, error: answersError } = buildRegistrationAnswers(event, req.body.answers);
        if (answersError) {
            return res.status(400).json({ meta: { status: 400, message: 'Invalid answers' }, data: null, errors: [{ message: answersError }] });
        }

        // Spot/tier selection (gap §6a-b). Resolve the chosen spot (defaults to the sole
        // spot; errors if a multi-spot event sent none). A paid spot can't be taken on the
        // free path. Spot-less legacy events resolve to {} → unchanged behaviour.
        const spotRes = resolveSpot(event, req.body.spotId);
        if (spotRes.error) {
            return res.status(400).json({ meta: { status: 400, message: 'Invalid spot' }, data: null, errors: [{ message: spotRes.error }] });
        }
        if (!requiresApproval) {
            if (spotRes.requiresPayment) {
                return res.status(409).json({ meta: { status: 409, message: 'This option is paid — reserve to pay' }, data: { paid: true, spotId: String(spotRes.spot?._id) }, errors: [{ message: 'Paid spot on free register' }] });
            }
            if (spotRes.spot) {
                const spotLeft = await seatsLeftForSpot(event, spotRes.spot._id);
                if (spotLeft < quantity) {
                    return res.status(409).json({ meta: { status: 409, message: 'This option is full' }, data: { full: true, spotId: String(spotRes.spot._id), waitlistAvailable: !!event.allowWaitlist }, errors: [{ message: 'No seats left for this spot' }] });
                }
            }
        }
        const spotId = spotRes.spot?._id;

        // Apply-with-work payload (gap §6a-d): captured only for the apply door (optional).
        const application = door === 'apply' ? buildApplication(req.body.application) : undefined;

        // DPDP consent (gap §6a-f): the attendee consents to sharing name/phone with the
        // host. Persisted (non-fatal) when the client sends it — the open-door client that
        // sends none is unaffected. Recorded here since both branches below register a seat.
        const consent = consentFromRequest(req);
        if (consent.accepted) await recordEventRegistrationConsent(userId, consent);

        if (prior) {
            // cancelled → reactivate (re-RSVP, or re-request for an approval-gated door)
            prior.status = requiresApproval ? 'pending' : 'registered';
            prior.cancelledAt = undefined;
            prior.cancelledBy = undefined;
            prior.cancellationReason = undefined;
            if (quantity) prior.quantity = quantity;
            if (spotId) prior.spotId = spotId;
            if (answers.length) prior.answers = answers;
            if (application) prior.application = application;
            await prior.save();
            if (!requiresApproval) {
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
                try {
                  await EventNotification.create({ eventId: event._id, kind: 'confirmation', channels: ['push', 'email'], audience: 'custom', customAudienceUserIds: [userId], body: `You're registered for ${event.title}.`, scheduledAt: new Date(), status: 'queued' });
                } catch { /* non-fatal */ }
            }
            const message = requiresApproval ? 'Request submitted' : 'Re-registered';
            return res.status(200).json({ meta: { status: 200, message }, data: { ...prior.toObject(), requiresApproval }, errors: [] });
        }

        const { registration, created } = await findOrCreateRegistration(idempotencyKey, {
            eventId: event._id,
            userId,
            quantity,
            attendees,
            spotId,
            answers: answers.length ? answers : undefined,
            application,
            status: requiresApproval ? 'pending' : 'registered',
            source: 'standard',
            visibility: 'public',
        });

        // Tickets + confirmation are issued only on a confirmed (open-door) registration.
        // A pending request gets its ticket when the host approves it (§6a-c).
        if (created && !requiresApproval) {
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
            try {
              await EventNotification.create({ eventId: event._id, kind: 'confirmation', channels: ['push', 'email'], audience: 'custom', customAudienceUserIds: [userId], body: `You're registered for ${event.title}.`, scheduledAt: new Date(), status: 'queued' });
            } catch { /* non-fatal */ }
        }

        const message = requiresApproval ? 'Request submitted — awaiting host approval' : 'Registered successfully';
        return res.status(201).json({ meta: { status: 201, message }, data: { ...registration.toObject(), requiresApproval }, errors: [] });
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
        const organizerId = req.user.id;

        // Accept the schema statuses + the host-facing synonyms (approve/approved, reject/
        // rejected/decline). Previously this wrote the raw value straight to the doc — a value
        // like 'approved' isn't in the enum, so save() threw a 500. Validate + translate instead.
        const raw = String(req.body?.status ?? '').trim();
        const SYNONYMS: Record<string, string> = {
            approve: 'registered', approved: 'registered',
            reject: 'declined', rejected: 'declined', decline: 'declined', declined: 'declined',
        };
        const target = SYNONYMS[raw] ?? raw;
        const VALID = ['registered', 'cancelled', 'attended', 'no-show', 'pending', 'declined'];
        if (!VALID.includes(target)) {
            return res.status(400).json({ meta: { status: 400, message: 'Invalid status' }, data: null, errors: [{ message: `Unsupported status "${raw}"` }] });
        }

        const registration = await EventRegistration.findById(registrationId);
        if (!registration) {
            return res.status(404).json({
                meta: { status: 404, message: 'Registration not found' },
                data: null,
                errors: [{ message: 'Registration not found' }]
            });
        }

        const event = await Event.findById(registration.eventId);
        if (!event) {
            return res.status(404).json({
                meta: { status: 404, message: 'Event not found' },
                data: null,
                errors: [{ message: 'Event not found' }]
            });
        }

        if (event.organizerId.toString() !== organizerId) {
            return res.status(403).json({
                meta: { status: 403, message: 'Not authorized' },
                data: null,
                errors: [{ message: 'Not authorized to manage this event' }]
            });
        }

        // Approving a pending request goes through the capacity-checked path (issues tickets);
        // declining routes through the shared decline. Any other transition is a plain set.
        if (target === 'registered' && registration.status === 'pending') {
            const result = await doApprove(registration, event);
            return res.status(result.code).json({ meta: { status: result.code, message: result.message }, data: result.code === 200 ? registration : null, errors: result.code === 200 ? [] : [{ message: result.message }] });
        }
        if (target === 'declined') {
            await doDecline(registration, typeof req.body?.reason === 'string' ? req.body.reason : undefined);
            return res.status(200).json({ meta: { status: 200, message: 'Declined' }, data: registration, errors: [] });
        }

        registration.status = target as IEventRegistration['status'];
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
        const eventId = req.params.id;
        // Confirmed + cancelled come from EventRegistration; the waitlist tab
        // is a separate collection. Host sees phone per the DPDP consent (A4).
        const [regs, waitlist] = await Promise.all([
            EventRegistration.find({ eventId }).populate('userId', 'displayName').sort({ registeredAt: -1 }).lean(),
            WaitlistEntry.find({ eventId, status: { $in: ['waiting', 'promoted'] } }).populate('userId', 'displayName').sort({ position: 1 }).lean(),
        ]);

        const toRow = (r: any) => ({
            _id: String(r._id),
            userId: String(r.userId?._id || r.userId || ''),
            name: r.attendees?.[0]?.fullName || r.userId?.displayName || 'Guest',
            phone: r.attendees?.[0]?.phone,
            seats: r.quantity ?? 1,
            registeredAt: r.registeredAt,
            status: r.status,
            visibility: r.visibility,
            spotId: r.spotId ? String(r.spotId) : undefined,
            answers: r.answers ?? [],
            application: r.application ?? undefined,
        });

        const confirmed = regs.filter((r: any) => r.status === 'registered' || r.status === 'attended').map(toRow);
        const cancelled = regs.filter((r: any) => r.status === 'cancelled').map(toRow);
        // Approval-gated requests awaiting the host's decision (§6a-c/d), newest first.
        const requests = regs.filter((r: any) => r.status === 'pending').map(toRow);
        const declined = regs.filter((r: any) => r.status === 'declined').map(toRow);
        const waitlistRows = waitlist.map((w: any) => ({
            _id: String(w._id),
            userId: String(w.userId?._id || w.userId || ''),
            name: w.attendeeSnapshot?.fullName || w.userId?.displayName || 'Guest',
            phone: w.attendeeSnapshot?.phone,
            seats: w.quantity ?? 1,
            position: w.position,
            joinedAt: w.createdAt,
            status: w.status,
        }));

        return res.status(200).json({
            meta: { status: 200, message: 'OK' },
            data: {
                confirmed,
                requests,
                waitlist: waitlistRows,
                cancelled,
                declined,
                counts: { confirmed: confirmed.length, requests: requests.length, waitlist: waitlistRows.length, cancelled: cancelled.length, declined: declined.length },
                // legacy aliases (old callers expect a flat confirmed list)
                rows: confirmed,
                total: confirmed.length,
            },
            errors: [],
        });
    } catch (err) {
        return res.status(500).json({ meta: { status: 500, message: 'Server Error' }, data: null, errors: [{ message: (err as Error).message }] });
    }
};
