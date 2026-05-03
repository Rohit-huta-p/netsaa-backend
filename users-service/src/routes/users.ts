import express from 'express';
import { getUserById } from '../controllers/users.controller';
import { patchMode } from '../controllers/mode.controller';
import { protect, optionalAuth } from '../middleware/auth';

const router = express.Router();

// PATCH /me/mode — client mirrors mode changes here (non-blocking)
// IMPORTANT: must be defined BEFORE /:id route to avoid /:id matching 'me'
router.patch('/me/mode', protect, patchMode);

// GET /api/users/:id — public, but optionally identifies the viewer so
// we can fire a profile.viewed notification when one signed-in user
// opens another's profile.
router.get('/:id', optionalAuth, getUserById);

export default router;
