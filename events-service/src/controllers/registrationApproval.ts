import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import Event, { IEvent } from '../models/Event';
import EventRegistration, { IEventRegistration } from '../models/EventRegistration';
import EventTicket from '../models/EventTicket';
import EventNotification from '../models/EventNotification';
import { generateTicketCode, generateBackupCode } from '../utils/ticketCode';
import { slotsLeftForEvent, seatsLeftForSpot } from '../services/waitlistService';

/**
 * Host approve / decline of a `pending` registration (guest_list / apply doors, §6a-c/d).
 *
 * A pending request holds no ticket and consumes no seat. Approval is capacity-checked
 * (409 if full — product decision) and, on success, flips the registration to `registered`
 * and issues its ticket(s). Decline flips it to `declined`. The core is exported so the
 * dedicated endpoints AND the legacy PATCH /registrations/:id/status share one code path.
 */

export interface ApprovalResult { code: number; message: string; }

/** Approve a pending registration: capacity-checked, → registered, issue tickets. */
export async function doApprove(registration: IEventRegistration, event: IEvent): Promise<ApprovalResult> {
  const qty = registration.quantity || 1;
  // Per-spot capacity when a tier was chosen, else event-level. 409 when full.
  const left = registration.spotId
    ? await seatsLeftForSpot(event, registration.spotId)
    : await slotsLeftForEvent(event._id);
  if (left < qty) {
    return { code: 409, message: registration.spotId ? 'This option is full' : 'Event is full' };
  }

  registration.status = 'registered';
  await registration.save();

  // Issue tickets if none exist yet (approval is the point of issue for a request).
  const existing = await EventTicket.countDocuments({ registrationId: registration._id });
  if (existing === 0) {
    const docs = Array.from({ length: qty }).map((_, i) => ({
      ticketId: `${registration._id}-${i}`,
      eventId: event._id,
      registrationId: registration._id,
      userId: registration.userId,
      attendeeName: registration.attendees?.[i]?.fullName || registration.attendees?.[0]?.fullName || 'Guest',
      qrCode: `${generateTicketCode(event.title)}|${generateBackupCode()}`,
      status: 'issued',
    }));
    await EventTicket.insertMany(docs);
  }

  try {
    await EventNotification.create({
      eventId: event._id, kind: 'confirmation', channels: ['push', 'email'], audience: 'custom',
      customAudienceUserIds: registration.userId ? [registration.userId] : [],
      body: `You're approved for ${event.title}.`, scheduledAt: new Date(), status: 'queued',
    });
  } catch { /* non-fatal */ }

  return { code: 200, message: 'Approved' };
}

/** Decline a pending registration → declined (optional reason). */
export async function doDecline(registration: IEventRegistration, reason?: string): Promise<ApprovalResult> {
  registration.status = 'declined';
  if (reason) registration.cancellationReason = reason;
  await registration.save();
  return { code: 200, message: 'Declined' };
}

/** Load the registration and assert the caller is the event's host. */
async function loadForHost(req: AuthRequest, res: Response): Promise<{ registration: IEventRegistration; event: IEvent } | null> {
  const registration = await EventRegistration.findById(req.params.id);
  if (!registration) {
    res.status(404).json({ meta: { status: 404, message: 'Registration not found' }, data: null, errors: [] });
    return null;
  }
  const event = await Event.findById(registration.eventId);
  if (!event) {
    res.status(404).json({ meta: { status: 404, message: 'Event not found' }, data: null, errors: [] });
    return null;
  }
  const hostId = req.user?.id || req.user?._id;
  if (String(event.organizerId) !== String(hostId)) {
    res.status(403).json({ meta: { status: 403, message: 'Not your event' }, data: null, errors: [] });
    return null;
  }
  return { registration, event };
}

// @route POST /v1/registrations/:id/approve  (host-only)
export const approveRegistration = async (req: AuthRequest, res: Response) => {
  try {
    const ctx = await loadForHost(req, res);
    if (!ctx) return;
    if (ctx.registration.status !== 'pending') {
      return res.status(409).json({ meta: { status: 409, message: 'Not a pending request' }, data: { status: ctx.registration.status }, errors: [] });
    }
    const result = await doApprove(ctx.registration, ctx.event);
    return res.status(result.code).json({
      meta: { status: result.code, message: result.message },
      data: result.code === 200 ? ctx.registration : { full: true },
      errors: result.code === 200 ? [] : [{ message: result.message }],
    });
  } catch (err) {
    return res.status(500).json({ meta: { status: 500, message: 'Server Error' }, data: null, errors: [{ message: (err as Error).message }] });
  }
};

// @route POST /v1/registrations/:id/decline  (host-only)
export const declineRegistration = async (req: AuthRequest, res: Response) => {
  try {
    const ctx = await loadForHost(req, res);
    if (!ctx) return;
    if (ctx.registration.status !== 'pending') {
      return res.status(409).json({ meta: { status: 409, message: 'Not a pending request' }, data: { status: ctx.registration.status }, errors: [] });
    }
    await doDecline(ctx.registration, typeof req.body?.reason === 'string' ? req.body.reason : undefined);
    return res.status(200).json({ meta: { status: 200, message: 'Declined' }, data: ctx.registration, errors: [] });
  } catch (err) {
    return res.status(500).json({ meta: { status: 500, message: 'Server Error' }, data: null, errors: [{ message: (err as Error).message }] });
  }
};
