import express from 'express';
import { protect } from '../middleware/auth';
import { patchMe, getMe } from '../controllers/organizer.controller';

const router = express.Router();

router.get('/me', protect, getMe);
router.patch('/me', protect, patchMe);

export default router;
