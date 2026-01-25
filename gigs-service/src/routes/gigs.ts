import express from 'express';
import {
    getGigs,
    getGigById,
    createGig,
    applyToGig,
    saveGig,
    getOrganizerGigs,
    updateGig,
    deleteGig,
    getGigApplications,
    updateApplicationStatus,
    getUserApplications,
    getSavedGigs
} from '../controllers/gigController';
import { getGigDiscussion, addGigComment } from '../controllers/gigDiscussionController';
import { protect, optionalAuth } from '../middleware/auth';

const router = express.Router();


// Public routes and refactored protected routes
router.route('/gigs').get(getGigs).post(protect, createGig);
router.route('/organizers/me/gigs').get(protect, getOrganizerGigs); // Access as /v1/organizers/me/gigs
router.route('/gigs/:id').get(optionalAuth, getGigById);
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

export default router;
