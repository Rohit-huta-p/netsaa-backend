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
    withdrawApplication,
    getUserApplications,
    getSavedGigs,
    getOrganizerStats
} from '../controllers/gigController';
import { getGigDiscussion, addGigComment } from '../controllers/gigDiscussionController';
import { protect, optionalAuth } from '../middleware/auth';

const router = express.Router();


// Public routes and refactored protected routes.
// PRD v4 §6 two-context model: every authenticated user can act as both a
// hirer (post gigs) and an artist (apply to gigs); context is page-based,
// not role-gated. The legacy `requireOrganizer` middleware that gated
// POST /v1/gigs has been removed — `protect` already guarantees req.user.id
// which the handler uses as organizerId at create time.
router.route('/gigs').get(getGigs).post(protect, createGig);
router.route('/gigs/:id').get(optionalAuth, getGigById);
router.route('/organizers/me/gigs').get(protect, getOrganizerGigs); // Access as /v1/organizers/me/gigs
router.route('/gigs/:id/apply').post(protect, applyToGig);
router.route('/gigs/:id/save').post(protect, saveGig);
router.route('/organizers/me/gigs/:gigId/applications').get(protect, getGigApplications);
// Cross-gig applicants aggregator for the hirer dashboard. Registered next to
// the per-gig applications route so the static '/applicants' path wins over
// any future generic/parametric path on this prefix.
router.route('/organizers/me/applicants').get(protect, getOrganizerApplicants);
router.route('/applications/:applicationId/status').patch(protect, updateApplicationStatus);
// Artist self-service withdraw. Placed before any potential generic
// /applications/:id route so the specific suffix wins.
router.patch('/applications/:id/withdraw', protect, withdrawApplication);
router.route('/users/me/gig-applications').get(protect, getUserApplications);
router.route('/users/me/saved-gigs').get(protect, getSavedGigs);

router.route('/gigs/:id').patch(protect, updateGig).delete(protect, deleteGig);

// Discussion Routes
router.route('/gigs/:gigId/discussion')
    .get(protect, getGigDiscussion)
    .post(protect, addGigComment);

// Organizer Stats Route (public - for trust card)
router.route('/users/:userId/organizer-stats').get(getOrganizerStats);

export default router;
