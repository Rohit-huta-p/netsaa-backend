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
import { createTicketType, getTicketTypesByEvent } from '../controllers/tickets';
import {
    registerForEvent, // Keep backward compatibility if needed, or deprecate
    getEventRegistrations,
    getUserRegistrations,
    updateRegistrationStatus,
} from '../controllers/registrations';
import { reserveTickets, cancelReservation } from '../controllers/eventReservationController';
import { createPaymentIntent, finalizeRegistration } from '../controllers/eventRegistrationController';
import { getEventDiscussion, addEventComment } from '../controllers/eventDiscussionController';
import { protect, optionalAuth, requireOrganizer } from '../middleware/auth';

const router = express.Router();

// Events Routes
router.route('/organizers/me/events').get(protect, getOrganizerEvents);
router.route('/events').get(getEvents).post(protect, requireOrganizer, createEvent);
router.route('/events/:id').get(optionalAuth, getEventById).patch(protect, updateEvent).delete(protect, deleteEvent);
router.route('/events/:id/publish').post(protect, publishEvent);
router.route('/events/:id/save').post(protect, saveEvent);

// Ticket Types Routes
router.route('/ticket-types').post(protect, createTicketType);
router.route('/events/:id/ticket-types').get(getTicketTypesByEvent);

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

// Discussion Routes
router.route('/events/:eventId/discussion')
    .get(protect, getEventDiscussion)
    .post(protect, addEventComment);

export default router;
