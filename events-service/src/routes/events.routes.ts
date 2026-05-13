import { Router } from 'express';
import { protect } from '../middleware/auth';
import rateLimit from 'express-rate-limit';
import { postCreateEvent, getEventDetail, getEventsList } from '../controllers/eventsCompose.controller';
import registrationsRoutes from './registrations.routes';
import rosterRoutes from './roster.routes';
import { postCancelEvent, postRescheduleEvent } from '../controllers/eventCancel.controller';
import { requireOrganizer } from '../middleware/ownerOnly';

const router = Router();

// Hirer rate limit: 3 events/day per user (disabled in test env)
const hirerEventRateLimit = rateLimit({
    windowMs: 24 * 60 * 60 * 1000,
    max: process.env.NODE_ENV === 'test' ? 10_000 : 3,
    keyGenerator: (req) => (req as any).user?.id || req.ip,
    message: { message: 'Daily event-publish limit reached (3/day). Try tomorrow.' },
    standardHeaders: true,
    legacyHeaders: false,
});

router.post('/', protect, hirerEventRateLimit, postCreateEvent);
router.get('/', getEventsList);
// Sub-routers must be mounted BEFORE the leaf GET /:id so Express tries further
// segments (/register, /registrations/me, /roster) first. mergeParams:true in
// each sub-router ensures req.params.id is available inside them.
router.use('/:id', registrationsRoutes);
router.use('/:id', rosterRoutes);
router.post('/:id/cancel', protect, requireOrganizer, postCancelEvent);
router.post('/:id/reschedule', protect, requireOrganizer, postRescheduleEvent);
router.get('/:id', getEventDetail);

export default router;
