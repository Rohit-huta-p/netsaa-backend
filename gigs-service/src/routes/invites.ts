// src/routes/invites.ts
import express from 'express';
import { protect } from '../middleware/auth';
import { createInvite, getReceivedInvites, getSentInvites, respondToInvite, withdrawInvite } from '../controllers/inviteController';

const router = express.Router();

router.route('/invites').post(protect, createInvite);
router.route('/invites/received').get(protect, getReceivedInvites);
router.route('/invites/sent').get(protect, getSentInvites);
router.route('/invites/:id/respond').patch(protect, respondToInvite);
router.route('/invites/:id/withdraw').patch(protect, withdrawInvite);

export default router;
