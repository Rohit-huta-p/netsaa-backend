import { Request, Response } from 'express';
import Event from '../models/Event';
import EventRegistration from '../models/EventRegistration';
import User from '../models/User';
import { reserveSpots, releaseSpots } from '../services/capacity.service';
import { publishNotification } from '../services/notificationPublisher.service';
import { createEventOrder } from '../services/razorpay.service';
import { emit } from '../utils/observability';

// Validation helpers
const PHONE_RE = /^(\+91[\s-]?)?[6-9]\d{9}$/;       // Indian mobile (with or without +91)
const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;
const MAX_ATTENDEES = 5;
const MAX_NOTES = 300;

function validateRegisterBody(body: any): { ok: true } | { ok: false; message: string } {
    if (!body.attendeeName || typeof body.attendeeName !== 'string' || body.attendeeName.trim().length < 2) {
        return { ok: false, message: 'attendeeName required (min 2 chars)' };
    }
    if (body.attendeeName.length > 80) {
        return { ok: false, message: 'attendeeName max 80 chars' };
    }
    if (!body.attendeePhone || typeof body.attendeePhone !== 'string') {
        return { ok: false, message: 'attendeePhone required' };
    }
    if (!PHONE_RE.test(body.attendeePhone.replace(/\s/g, ''))) {
        return { ok: false, message: 'attendeePhone must be a valid Indian mobile number' };
    }
    if (body.attendeeEmail && !EMAIL_RE.test(body.attendeeEmail)) {
        return { ok: false, message: 'attendeeEmail must be a valid email' };
    }
    const count = Number(body.attendeeCount ?? 1);
    if (!Number.isInteger(count) || count < 1 || count > MAX_ATTENDEES) {
        return { ok: false, message: `attendeeCount must be 1-${MAX_ATTENDEES}` };
    }
    if (Array.isArray(body.guestNames)) {
        if (body.guestNames.length > count - 1) {
            return { ok: false, message: 'guestNames length must be <= attendeeCount - 1' };
        }
        for (const g of body.guestNames) {
            if (typeof g !== 'string' || g.length > 80) {
                return { ok: false, message: 'guestNames entries must be strings up to 80 chars' };
            }
        }
    }
    if (body.notes && (typeof body.notes !== 'string' || body.notes.length > MAX_NOTES)) {
        return { ok: false, message: `notes max ${MAX_NOTES} chars` };
    }
    return { ok: true };
}

export async function postRegister(req: Request, res: Response) {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const eventId = req.params.id;
    const body = req.body ?? {};
    const {
        visibility = 'private',
        attendeeName,
        attendeePhone,
        attendeeEmail,
        attendeeCount = 1,
        guestNames = [],
        notes,
    } = body;

    const validation = validateRegisterBody(body);
    if (!validation.ok) {
        return res.status(400).json({ message: validation.message });
    }

    const seats = Number(attendeeCount);

    try {
        const event = await Event.findById(eventId).select(
            'organizerId status startsAt registrationMode pricing title'
        );
        if (!event) return res.status(404).json({ message: 'Event not found' });
        if ((event as any).organizerId.toString() === userId) {
            return res.status(403).json({ message: 'You created this event' });
        }
        if ((event as any).status !== 'live') {
            return res.status(410).json({ message: 'Event is not accepting registrations' });
        }
        if ((event as any).startsAt < new Date()) {
            return res.status(410).json({ message: 'Event already started' });
        }

        // Atomic multi-seat reserve (applies to both free and paid — paid users
        // hold the seat through the payment window; webhook flips status to confirmed,
        // payment.failed releases via webhook compensation).
        const result = await reserveSpots(eventId, seats);
        if (!result.ok) {
            return res.status(409).json({
                message: `Event has fewer than ${seats} seat${seats === 1 ? '' : 's'} left or is inactive`,
            });
        }

        // Audit snapshot of user profile at register time (separate from editable attendee fields)
        const userDoc = await User.findById(userId).select('name phone city email');
        const contactSnapshot = userDoc ? {
            name: (userDoc as any).name,
            phone: (userDoc as any).phone,
            city: (userDoc as any).city,
        } : undefined;

        const isPaid = (event as any).registrationMode === 'paid_ticket';

        // --- PAID FLOW: create Razorpay order BEFORE inserting registration row.
        // If order creation throws, release seats and bail; no orphan registration.
        let razorpayOrderId: string | undefined;
        let orderAmountPaise: number | undefined;
        let orderCurrency = 'INR';
        let unitPriceRupees: number | undefined;

        if (isPaid) {
            const pricing = (event as any).pricing;
            const unit = Number(pricing?.amount);
            if (!Number.isFinite(unit) || unit <= 0) {
                await releaseSpots(eventId, seats);
                return res.status(422).json({ message: 'Event pricing is not configured' });
            }
            unitPriceRupees = unit;
            const totalRupees = unit * seats;
            const receiptKey = `evt-${eventId}-${userId}-${Date.now()}`.slice(0, 40);

            try {
                const order = await createEventOrder({
                    amountInRupees: totalRupees,
                    receiptKey,
                    notes: {
                        eventId: String(eventId),
                        userId: String(userId),
                        attendeeCount: seats,
                        attendeeName: attendeeName.trim(),
                        attendeePhone: attendeePhone.trim(),
                    },
                });
                razorpayOrderId = order.id;
                orderAmountPaise = order.amount;
                orderCurrency = order.currency || 'INR';
            } catch (err: any) {
                await releaseSpots(eventId, seats);
                emit('razorpay_order_create_failed', 'error', {
                    eventId,
                    userId,
                    seats,
                    error: err?.message,
                });
                return res.status(500).json({ message: 'Could not initiate payment, please try again' });
            }
        }

        // Insert registration row. For paid: status=pending_payment until webhook captures.
        // For free: confirmed immediately.
        try {
            await EventRegistration.create({
                eventId,
                userId,
                status: isPaid ? 'pending_payment' : 'confirmed',
                source: isPaid ? 'paid' : 'rsvp',
                visibility: visibility === 'public' ? 'public' : 'private',
                contactSnapshot,
                attendeeName: attendeeName.trim(),
                attendeePhone: attendeePhone.trim(),
                attendeeEmail: attendeeEmail?.trim() || undefined,
                attendeeCount: seats,
                guestNames: Array.isArray(guestNames) ? guestNames.filter((g: string) => g?.trim()).slice(0, seats - 1) : [],
                notes: notes?.trim() || undefined,
                registeredAt: new Date(),
                ...(isPaid
                    ? {
                          paymentStatus: 'pending' as const,
                          razorpayOrderId,
                          paidAmount: (unitPriceRupees ?? 0) * seats,
                      }
                    : {}),
            });
        } catch (e: any) {
            if (e.code === 11000) {
                await releaseSpots(eventId, seats);
                // Orphan order (if paid) auto-expires on Razorpay side; no manual cleanup needed.
                return res.status(409).json({ message: 'Already registered for this event' });
            }
            await releaseSpots(eventId, seats);
            throw e;
        }

        // --- PAID FLOW: do NOT publish first/new registration notifications yet.
        // Webhook handler emits event.payment_captured on capture (Task 3).
        if (isPaid) {
            return res.status(200).json({
                data: {
                    ok: true,
                    visibility,
                    attendeeCount: seats,
                    paymentRequired: true,
                    order_id: razorpayOrderId,
                    amount: orderAmountPaise,
                    currency: orderCurrency,
                    key_id: process.env.RAZORPAY_KEY_ID,
                    prefill: {
                        name: attendeeName.trim(),
                        email: attendeeEmail?.trim() || (userDoc as any)?.email || undefined,
                        contact: attendeePhone.trim(),
                    },
                },
            });
        }

        // --- FREE FLOW: unchanged — confirm + notify immediately.
        const priorCount = await EventRegistration.countDocuments({ eventId, status: 'confirmed' });
        if (priorCount === 1) {
            await publishNotification({
                subtype: 'event.first_registration_ever',
                eventId,
                organizerId: (event as any).organizerId.toString(),
                registrantName: attendeeName,
                attendeeCount: seats,
            });
        } else {
            await publishNotification({
                subtype: 'event.new_registration',
                eventId,
                organizerId: (event as any).organizerId.toString(),
                registrantName: attendeeName,
                attendeeCount: seats,
            });
        }

        res.status(200).json({ data: { ok: true, visibility, attendeeCount: seats, paymentRequired: false } });
    } catch (err) {
        console.error('postRegister error:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
}

export async function deleteMyRegistration(req: Request, res: Response) {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const eventId = req.params.id;

    const updated = await EventRegistration.findOneAndUpdate(
        { eventId, userId, status: 'confirmed' },
        { status: 'cancelled', cancelledAt: new Date() },
        { new: true }
    );

    if (!updated) {
        return res.status(404).json({ message: 'No active registration found' });
    }

    // Release ALL seats this registration held (multi-seat support)
    const seats = (updated as any).attendeeCount ?? 1;
    await releaseSpots(eventId, seats);
    res.json({ data: { ok: true, releasedSeats: seats } });
}
