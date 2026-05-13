import { Router } from 'express';
import { protect } from '../middleware/auth';
import { requireOrganizer } from '../middleware/ownerOnly';
import { getRoster } from '../controllers/roster.controller';

const router = Router({ mergeParams: true });

router.get('/roster', protect, requireOrganizer, getRoster);

export default router;
