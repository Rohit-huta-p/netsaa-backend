import express from 'express';
import { getUserById } from '../controllers/users.controller';
import { patchMode } from '../controllers/mode.controller';
import { protect } from '../middleware/auth';

const router = express.Router();

// PATCH /me/mode — client mirrors mode changes here (non-blocking)
// IMPORTANT: must be defined BEFORE /:id route to avoid /:id matching 'me'
router.patch('/me/mode', protect, patchMode);

// GET /api/users/:id
router.get('/:id', getUserById);

export default router;
