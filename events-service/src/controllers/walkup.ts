import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import Event from '../models/Event';
import EventRegistration from '../models/EventRegistration';
import EventTicket from '../models/EventTicket';
import { slotsLeftForEvent } from '../services/waitlistService';
import { generateTicketCode, generateBackupCode } from '../utils/ticketCode';

const j = (status: number, message: string, data: any = null, errors: any[] = []) => ({ meta: { status, message }, data, errors });
const rand = () => Math.random().toString(36).slice(2, 10);

// @desc   Organizer adds an at-the-door walk-up (guest, no account) — checked in immediately
// @route  POST /v1/events/:id/walkup
// @access Private (event organizer only)
export const addWalkup = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id || req.user?._id;
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json(j(404, 'Event not found'));
    if (event.organizerId.toString() !== String(userId)) return res.status(403).json(j(403, 'Only the host can add walk-ups'));
    if (!event.walkupsAllowed) return res.status(409).json(j(409, 'Walk-ups are not enabled for this event'));
    if (event.status !== 'live') return res.status(409).json(j(409, 'Event is not live'));

    const { fullName, phone, quantity = 1, payment = 'free' } = req.body;
    if (!fullName || !phone) return res.status(400).json(j(400, 'Name and phone required'));

    const qty = Math.max(1, Math.min(event.maxGuestsPerRegistration || 5, Number(quantity) || 1));
    if ((await slotsLeftForEvent(event._id)) < qty) return res.status(409).json(j(409, 'Not enough seats left', { full: true }));

    const isCashPaid = payment === 'cash' && (event.ticketPrice || 0) > 0;
    const registration = await EventRegistration.create({
      eventId: event._id,
      // NO userId — walk-ups are guests with no NETSA account (partial index exempts them)
      quantity: qty,
      status: 'attended',                       // physically at the door = present
      idempotencyKey: `walkup-${event._id}-${Date.now()}-${rand()}`,
      source: 'walkup',
      visibility: 'private',                    // not on the public roster
      attendees: [{ fullName, phone }],
      ...(isCashPaid
        ? { offlinePayment: { method: 'cash', amountPaise: event.ticketPrice * qty * 100, recordedByUserId: userId, recordedAt: new Date() } }
        : {}),
    });

    await EventTicket.insertMany(
      Array.from({ length: qty }).map((_, i) => ({
        ticketId: `${registration._id}-${i}`,
        eventId: event._id,
        registrationId: registration._id,
        // no userId — guest ticket
        attendeeName: fullName,
        qrCode: `${generateTicketCode(event.title)}|${generateBackupCode()}`,
        status: 'checked_in',
        checkedInAt: new Date(),
      })),
    );

    return res.status(201).json(j(201, 'Walk-up added', { registrationId: registration._id, status: 'attended', seats: qty }));
  } catch (err) {
    return res.status(400).json(j(400, 'Walk-up failed', null, [{ message: (err as Error).message }]));
  }
};
