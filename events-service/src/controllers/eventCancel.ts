import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import Event from '../models/Event';
import EventRegistration from '../models/EventRegistration';
import Refund from '../models/Refund';
import EventCancellation from '../models/EventCancellation';
import { computeRefundPaise } from '../utils/refundPolicy';

// @route POST /v1/events/:id/cancel
// @access Private (organizer of this event)
export const cancelEvent = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id || req.user?._id;
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ meta: { status: 404, message: 'Event not found' }, data: null, errors: [] });
    if (event.organizerId.toString() !== String(userId)) return res.status(403).json({ meta: { status: 403, message: 'Not your event' }, data: null, errors: [] });
    if (event.status === 'cancelled') return res.status(409).json({ meta: { status: 409, message: 'Already cancelled' }, data: null, errors: [] });

    const reason = (req.body.reason || '').slice(0, 500);
    const registrations = await EventRegistration.find({ eventId: event._id, status: { $in: ['registered', 'attended'] } });

    let totalRefundPaise = 0, netsaAbsorbedTotalPaise = 0, attendeeCount = 0;
    for (const reg of registrations) {
      attendeeCount += reg.quantity || 1;
      reg.status = 'cancelled';
      reg.cancelledAt = new Date();
      reg.cancelledBy = 'organizer';
      reg.cancellationReason = reason;
      await reg.save();

      if (reg.paymentRecord?.razorpayPaymentId) {
        const comp = computeRefundPaise(event, reg, new Date(), 'organizer_cancel');
        totalRefundPaise += comp.refundAmountPaise;
        netsaAbsorbedTotalPaise += comp.netsaAbsorbedPaise;
        await Refund.create({
          registrationId: reg._id, eventId: event._id, userId: reg.userId,
          razorpayPaymentId: reg.paymentRecord.razorpayPaymentId,
          trigger: 'organizer_cancel', triggeredBy: userId,
          refundAmountPaise: comp.refundAmountPaise, netsaAbsorbedPaise: comp.netsaAbsorbedPaise,
          status: 'pending', initiatedAt: new Date(),
        });
      }
    }

    event.status = 'cancelled';
    await event.save();

    await EventCancellation.create({
      eventId: event._id, cancelledBy: userId, reason,
      affectedRegistrationsCount: registrations.length, affectedAttendeeCount: attendeeCount,
      totalRefundAmountPaise: totalRefundPaise, netsaAbsorbedTotalPaise,
      refundsInitiatedAt: new Date(), attendeesNotifiedAt: new Date(),
    });

    return res.status(200).json({ meta: { status: 200, message: 'Event cancelled' }, data: { affectedRegistrations: registrations.length, totalRefundPaise, netsaAbsorbedTotalPaise }, errors: [] });
  } catch (err) {
    return res.status(500).json({ meta: { status: 500, message: 'Server Error' }, data: null, errors: [{ message: (err as Error).message }] });
  }
};
