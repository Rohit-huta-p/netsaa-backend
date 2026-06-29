import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import EventRegistration from '../models/EventRegistration';
import Event from '../models/Event';
import Refund from '../models/Refund';
import { computeRefundPaise } from '../utils/refundPolicy';
import { promoteFromWaitlist } from '../services/waitlistService';
import EventNotification from '../models/EventNotification';

// @route POST /v1/registrations/:id/cancel
// @access Private (owner)
export const cancelMyRegistration = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id || req.user?._id;
    const registration = await EventRegistration.findById(req.params.id);
    if (!registration) return res.status(404).json({ meta: { status: 404, message: 'Registration not found' }, data: null, errors: [] });
    if (registration.userId.toString() !== String(userId)) return res.status(403).json({ meta: { status: 403, message: 'Not your registration' }, data: null, errors: [] });
    if (registration.status === 'cancelled') return res.status(409).json({ meta: { status: 409, message: 'Already cancelled' }, data: null, errors: [] });

    const event = await Event.findById(registration.eventId);

    // Flip the registration — slot returns by virtue of status (D3); no counter to decrement
    registration.status = 'cancelled';
    registration.cancelledAt = new Date();
    registration.cancelledBy = 'attendee';
    registration.cancellationReason = (req.body.reason || '').slice(0, 200);
    await registration.save();

    // Enqueue cancellation notification (best-effort)
    try {
      const eventTitle = event?.title || String(registration.eventId);
      await EventNotification.create({ eventId: registration.eventId, kind: 'cancellation', channels: ['push', 'email'], audience: 'custom', customAudienceUserIds: [userId], body: `Your registration for ${eventTitle} was cancelled.`, scheduledAt: new Date(), status: 'queued' });
    } catch { /* non-fatal */ }

    // Freed a seat — attempt auto-promotion (no-op for manual-mode events).
    try {
      await promoteFromWaitlist(registration.eventId);
    } catch (_) { /* non-fatal */ }

    // Paid registration inside a refund window → create a pending Refund
    let refund = null;
    if (registration.paymentRecord?.razorpayPaymentId && event) {
      const comp = computeRefundPaise(event, registration, new Date(), 'attendee_cancel');
      if (comp.refundAmountPaise > 0) {
        refund = await Refund.create({
          registrationId: registration._id, eventId: event._id, userId,
          razorpayPaymentId: registration.paymentRecord.razorpayPaymentId,
          trigger: 'attendee_cancel', triggeredBy: userId,
          refundAmountPaise: comp.refundAmountPaise, netsaAbsorbedPaise: comp.netsaAbsorbedPaise,
          status: 'pending', initiatedAt: new Date(),
        });
      }
    }

    return res.status(200).json({ meta: { status: 200, message: 'Cancelled' }, data: { status: 'cancelled', refundId: refund?._id ?? null, refundAmountPaise: refund?.refundAmountPaise ?? 0 }, errors: [] });
  } catch (err) {
    return res.status(500).json({ meta: { status: 500, message: 'Server Error' }, data: null, errors: [{ message: (err as Error).message }] });
  }
};
