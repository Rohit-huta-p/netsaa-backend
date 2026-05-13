import { Router } from 'express';
import { protect } from '../middleware/auth';
import { getCalendarIcs } from '../controllers/calendar.controller';

const router = Router({ mergeParams: true });

router.get('/calendar.ics', protect, getCalendarIcs);

export default router;
