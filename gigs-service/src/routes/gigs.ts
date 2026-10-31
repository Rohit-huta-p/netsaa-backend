import express from 'express';
import {
    getGigs,
    getGigById,
    createGig,
    applyToGig,
    saveGig,
    getOrganizerGigs,
    getOrganizerApplicants,
    updateGig,
    deleteGig,
    getGigApplications,
    updateApplicationStatus,
    getUserApplications,
    getSavedGigs,
    getOrganizerStats,
    getPublicOrganizerGigs
} from '../controllers/gigController';
import { getGigDiscussion, addGigComment, togglePinGigComment, deleteGigComment } from '../controllers/gigDiscussionController';
import { protect, optionalAuth, requireOrganizer } from '../middleware/auth';

const router = express.Router();


// Public routes and refactored protected routes
router.route('/gigs').get(optionalAuth, getGigs).post(protect, requireOrganizer, createGig);
router.route('/gigs/:id').get(optionalAuth, getGigById);
router.route('/organizers/me/gigs').get(protect, getOrganizerGigs); // Access as /v1/organizers/me/gigs
// Public: an organizer's published gigs for their company profile ("Now hiring").
// Registered AFTER the literal "/organizers/me/gigs" so "me" still matches that route.
router.route('/organizers/:organizerId/gigs').get(optionalAuth, getPublicOrganizerGigs);
router.route('/organizers/me/applicants').get(protect, getOrganizerApplicants); // Aggregate applicants across all the organizer's gigs
router.route('/gigs/:id/apply').post(protect, applyToGig);
router.route('/gigs/:id/save').post(protect, saveGig);
router.route('/organizers/me/gigs/:gigId/applications').get(protect, getGigApplications);
router.route('/applications/:applicationId/status').patch(protect, updateApplicationStatus);
router.route('/users/me/gig-applications').get(protect, getUserApplications);
router.route('/users/me/saved-gigs').get(protect, getSavedGigs);

router.route('/gigs/:id').patch(protect, updateGig).delete(protect, deleteGig);

// Discussion Routes
router.route('/gigs/:gigId/discussion')
    .get(protect, getGigDiscussion)
    .post(protect, addGigComment);
// Moderation (gig owner / author / admin) — the FE already calls these.
router.route('/gigs/:gigId/discussion/:commentId/pin').put(protect, togglePinGigComment);
router.route('/gigs/:gigId/discussion/:commentId').delete(protect, deleteGigComment);

// Organizer Stats Route (public - for trust card)
router.route('/users/:userId/organizer-stats').get(getOrganizerStats);

export default router;
