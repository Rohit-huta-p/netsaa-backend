import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import Event from '../models/Event';
import WaitlistEntry from '../models/WaitlistEntry';
import EventRegistration from '../models/EventRegistration';
import { slotsLeftForEvent, nextPosition, promoteEntry, promoteFromWaitlist } from '../services/waitlistService';
import { generateTicketCode, generateBackupCode } from '../utils/ticketCode';
import EventTicket from '../models/EventTicket';

// @route POST /v1/events/:id/waitlist/join
export const joinWaitlist = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id || req.user?._id;
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ meta: { status: 404, message: 'Event not found' }, data: null, errors: [] });
    if (!event.allowWaitlist) return res.status(409).json({ meta: { status: 409, message: 'Waitlist not enabled' }, data: null, errors: [] });
    if ((await slotsLeftForEvent(event._id)) > 0) return res.status(409).json({ meta: { status: 409, message: 'Seats available — register instead' }, data: null, errors: [] });

    const existing = await WaitlistEntry.findOne({ eventId: event._id, userId });
    if (existing && ['waiting', 'promoted'].includes(existing.status)) {
      return res.status(409).json({ meta: { status: 409, message: 'Already on the waitlist' }, data: null, errors: [] });
    }

    const position = await nextPosition(event._id);
    const entry = await WaitlistEntry.findOneAndUpdate(
      { eventId: event._id, userId },
      {
        eventId: event._id, userId, position,
        quantity: Math.max(1, Math.min(event.maxGuestsPerRegistration || 5, req.body.quantity || 1)),
        status: 'waiting', joinedAt: new Date(),
        attendeeSnapshot: req.body.attendeeSnapshot,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    return res.status(201).json({ meta: { status: 201, message: 'Joined waitlist' }, data: { entryId: entry._id, position: entry.position, status: entry.status }, errors: [] });
  } catch (err) {
    return res.status(400).json({ meta: { status: 400, message: 'Join failed' }, data: null, errors: [{ message: (err as Error).message }] });
  }
};

// @route DELETE /v1/events/:id/waitlist
export const leaveWaitlist = async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id || req.user?._id;
  const entry = await WaitlistEntry.findOne({ eventId: req.params.id, userId });
  if (!entry) return res.status(404).json({ meta: { status: 404, message: 'Not on the waitlist' }, data: null, errors: [] });
  entry.status = 'declined';
  await entry.save();
  return res.status(200).json({ meta: { status: 200, message: 'Left the waitlist' }, data: { status: 'declined' }, errors: [] });
};

// @route POST /v1/events/:id/waitlist/promote  (organizer manual approve — promotes top waiting entry)
export const promoteWaitlist = async (req: AuthRequest, res: Response) => {
  const event = await Event.findById(req.params.id);
  if (!event) return res.status(404).json({ meta: { status: 404, message: 'Event not found' }, data: null, errors: [] });
  if (event.organizerId.toString() !== String(req.user?.id || req.user?._id)) {
    return res.status(403).json({ meta: { status: 403, message: 'Not your event' }, data: null, errors: [] });
  }
  if ((await slotsLeftForEvent(event._id)) <= 0) return res.status(409).json({ meta: { status: 409, message: 'No free seat' }, data: null, errors: [] });
  const top = await WaitlistEntry.findOne({ eventId: event._id, status: 'waiting' }).sort({ position: 1 });
  if (!top) return res.status(404).json({ meta: { status: 404, message: 'Waitlist empty' }, data: null, errors: [] });
  await promoteEntry(top);
  return res.status(200).json({ meta: { status: 200, message: 'Promoted' }, data: { entryId: top._id }, errors: [] });
};

// @route POST /v1/waitlist/:id/confirm  (promoted user accepts — FREE path; paid reuses /reserve)
export const confirmPromotion = async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id || req.user?._id;
  const entry = await WaitlistEntry.findById(req.params.id);
  if (!entry) return res.status(404).json({ meta: { status: 404, message: 'Entry not found' }, data: null, errors: [] });
  if (entry.userId.toString() !== String(userId)) return res.status(403).json({ meta: { status: 403, message: 'Not your entry' }, data: null, errors: [] });
  if (entry.status !== 'promoted') return res.status(409).json({ meta: { status: 409, message: 'Not promoted' }, data: null, errors: [] });
  if (entry.promotionExpiresAt && Date.now() > new Date(entry.promotionExpiresAt).getTime()) {
    return res.status(410).json({ meta: { status: 410, message: 'Promotion window expired' }, data: null, errors: [] });
  }

  const event = await Event.findById(entry.eventId);
  // Paid events: caller must go through /reserve → Razorpay; this endpoint handles the free path.
  if (event && event.ticketPrice > 0) {
    return res.status(409).json({ meta: { status: 409, message: 'Paid event — reserve to confirm' }, data: { reserveRequired: true }, errors: [] });
  }

  const idempotencyKey = (req.header('Idempotency-Key') || `wl-${entry._id}`).trim();
  const registration = await EventRegistration.create({
    eventId: entry.eventId, userId, quantity: entry.quantity, status: 'registered',
    idempotencyKey, source: 'standard', visibility: 'public',
    attendees: [{ fullName: entry.attendeeSnapshot.fullName, phone: entry.attendeeSnapshot.phone, email: entry.attendeeSnapshot.email }],
  });
  await EventTicket.insertMany(Array.from({ length: entry.quantity }).map((_, i) => ({
    ticketId: `${registration._id}-${i}`, eventId: entry.eventId, registrationId: registration._id, userId,
    attendeeName: entry.attendeeSnapshot.fullName, qrCode: `${generateTicketCode(event?.title || 'NETSA')}|${generateBackupCode()}`, status: 'issued',
  })));

  entry.status = 'confirmed';
  entry.confirmedAt = new Date();
  entry.registrationId = registration._id;
  await entry.save();

  return res.status(201).json({ meta: { status: 201, message: 'Confirmed' }, data: { registrationId: registration._id }, errors: [] });
};

// @route GET /v1/events/:id/waitlist/me — the caller's active entry (waiting/promoted), powers the CTA + promoted banner
export const getMyWaitlistEntry = async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id || req.user?._id;
  const entry = await WaitlistEntry.findOne({
    eventId: req.params.id,
    userId,
    status: { $in: ['waiting', 'promoted'] },
  }).lean();
  if (!entry) return res.status(404).json({ meta: { status: 404, message: 'Not on waitlist' }, data: null, errors: [] });
  return res.status(200).json({ meta: { status: 200, message: 'OK' }, data: entry, errors: [] });
};
