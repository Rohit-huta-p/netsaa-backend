import express from 'express';
import {
    getEvents,
    getEventById,
    createEvent,
    updateEvent,
    deleteEvent,
    publishEvent,
    getOrganizerEvents,
    saveEvent,
    getSavedEvents,
} from '../controllers/events';
import { createTicketType, getTicketTypesByEvent, checkinTicket, getRegistrationTicket, checkInByCode } from '../controllers/tickets';
import {
    registerForEvent, // Keep backward compatibility if needed, or deprecate
    getEventRegistrations,
    getUserRegistrations,
    updateRegistrationStatus,
} from '../controllers/registrations';
import { reserveTickets, cancelReservation } from '../controllers/eventReservationController';
import { createPaymentIntent, finalizeRegistration } from '../controllers/eventRegistrationController';
import { getEventDiscussion, addEventComment } from '../controllers/eventDiscussionController';
import { submitPayoutAccount, getMyPayoutAccount, updatePayoutAccount } from '../controllers/payouts';
import { protect, optionalAuth, requireOrganizer } from '../middleware/auth';

const router = express.Router();

// Events Routes
router.route('/organizers/me/events').get(protect, getOrganizerEvents);
// Events are open to all (three-role model: client | creative_lead | artist).
// Any authenticated user can host one — no organizer-role gate. `protect` only.
router.route('/events').get(getEvents)
    .post(protect, createEvent);
router.route('/events/:id').get(optionalAuth, getEventById).patch(protect, updateEvent).delete(protect, deleteEvent);
router.route('/events/:id/publish').post(protect, publishEvent);
router.route('/events/:id/save').post(protect, saveEvent);

// Ticket Types Routes
router.route('/ticket-types').post(protect, createTicketType);
router.route('/events/:id/ticket-types').get(getTicketTypesByEvent);

// Ticket Check-in Route
router.route('/tickets/checkin').post(protect, requireOrganizer, checkinTicket);

// Registration Ticket (owner-gated)
router.route('/registrations/:id/ticket').get(protect, getRegistrationTicket);

// Check-in by ticket code or backup code
router.route('/events/:id/check-in').post(protect, checkInByCode);

// Registration Routes
router.route('/events/:id/register').post(protect, registerForEvent);
router.route('/events/:id/registrations').get(protect, getEventRegistrations);
router.route('/registrations/:registrationId/status').patch(protect, updateRegistrationStatus);
router.route('/users/me/event-registrations').get(protect, getUserRegistrations);
router.route('/users/me/saved-events').get(protect, getSavedEvents);

// New Reservation & Payment flow
router.route('/events/:id/reserve').post(protect, reserveTickets);
router.route('/reservations/:id/cancel').post(protect, cancelReservation);
router.route('/events/:id/checkout').post(protect, createPaymentIntent);
router.route('/events/:id/finalize').post(protect, finalizeRegistration);

// Payout account routes
router.route('/payouts/account').post(protect, submitPayoutAccount);
router.route('/payouts/account/me').get(protect, getMyPayoutAccount).patch(protect, updatePayoutAccount);

// Discussion Routes
router.route('/events/:eventId/discussion')
    .get(protect, getEventDiscussion)
    .post(protect, addEventComment);

export default router;
