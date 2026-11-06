import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import Event from '../models/Event';
import EventRegistration from '../models/EventRegistration';
import Refund from '../models/Refund';
import EventCancellation from '../models/EventCancellation';
import EventTicket from '../models/EventTicket';
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
          razorpayOrderId: reg.paymentRecord.razorpayOrderId,
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

// @route POST /v1/events/:id/registrations/:registrationId/cancel
// @access Private (organizer of this event)
// Per-attendee analogue of cancelEvent: flip ONE registration → cancelled, void its
// still-issued tickets so the freed seat can't be scanned in, and (paid only) create a
// pending organizer-cancel Refund for the settlement worker to submit to Cashfree. Free
// registrations just cancel — no payment, no refund. The seat frees itself: capacity is
// counted from active registrations (count-on-read), so the status flip is enough.
//
// Distinct from PATCH /registrations/:id/status → 'cancelled', which is a plain status
// set with NO refund and NO ticket void (a cancelled attendee could still be scanned in).
export const cancelRegistrationByOrganizer = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id || req.user?._id;
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ meta: { status: 404, message: 'Event not found' }, data: null, errors: [] });
    if (!userId || event.organizerId.toString() !== String(userId)) return res.status(403).json({ meta: { status: 403, message: 'Not your event' }, data: null, errors: [] });

    const registration = await EventRegistration.findById(req.params.registrationId);
    if (!registration || registration.eventId.toString() !== String(event._id)) {
      return res.status(404).json({ meta: { status: 404, message: 'Registration not found for this event' }, data: null, errors: [] });
    }

    // Cancellable = a seat-holding attendee. 'approved' holds a seat awaiting payment (no
    // payment captured → no refund). pending/declined hold no seat (decline those instead);
    // cancelled is terminal.
    const CANCELLABLE = ['registered', 'attended', 'approved'];
    if (!CANCELLABLE.includes(registration.status)) {
      return res.status(409).json({ meta: { status: 409, message: `Cannot cancel a ${registration.status} registration` }, data: null, errors: [] });
    }

    const reason = (req.body.reason || '').slice(0, 500);
    registration.status = 'cancelled';
    registration.cancelledAt = new Date();
    registration.cancelledBy = 'organizer';
    registration.cancellationReason = reason;
    await registration.save();

    // Void the still-issued tickets so the freed seat can't be checked in. A checked_in
    // ticket is left intact — that attendance already happened.
    await EventTicket.updateMany(
      { registrationId: registration._id, status: 'issued' },
      { $set: { status: 'cancelled' } },
    );

    // Refund path (paid only): mirror cancelEvent — create a pending organizer-cancel Refund;
    // the settlement worker submits it to Cashfree. computeRefundPaise makes the attendee
    // whole INCLUDING the service fee on an organizer cancel (NETSA absorbs the fee).
    let refund: any = null;
    if (registration.paymentRecord?.razorpayPaymentId) {
      const comp = computeRefundPaise(event, registration, new Date(), 'organizer_cancel');
      refund = await Refund.create({
        registrationId: registration._id, eventId: event._id, userId: registration.userId,
        razorpayPaymentId: registration.paymentRecord.razorpayPaymentId,
        razorpayOrderId: registration.paymentRecord.razorpayOrderId,
        trigger: 'organizer_cancel', triggeredBy: userId,
        refundAmountPaise: comp.refundAmountPaise, netsaAbsorbedPaise: comp.netsaAbsorbedPaise,
        status: 'pending', initiatedAt: new Date(),
      });
    }

    return res.status(200).json({
      meta: { status: 200, message: 'Registration cancelled' },
      data: {
        registrationId: registration._id,
        status: 'cancelled',
        seatFreed: true,
        refund: refund
          ? { refundAmountPaise: refund.refundAmountPaise, netsaAbsorbedPaise: refund.netsaAbsorbedPaise, status: refund.status }
          : null,
      },
      errors: [],
    });
  } catch (err) {
    return res.status(500).json({ meta: { status: 500, message: 'Server Error' }, data: null, errors: [{ message: (err as Error).message }] });
  }
};
