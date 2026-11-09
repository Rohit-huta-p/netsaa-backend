import express from 'express';
import { protect } from '../middleware/auth';
import FollowsController from './follows.controller';

const router = express.Router();

// Follow / unfollow a user or organization, and read the current viewer's
// follow state + that user's follower count. All require auth (protect).
router.get('/:userId/status', protect, FollowsController.status);
router.post('/:userId', protect, FollowsController.follow);
router.delete('/:userId', protect, FollowsController.unfollow);

export default router;
