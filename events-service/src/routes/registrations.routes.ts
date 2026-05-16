import { Router } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { protect } from '../middleware/auth';
import { postRegister, deleteMyRegistration } from '../controllers/registrations.controller';
import { getMyRegistration } from '../controllers/roster.controller';

const router = Router({ mergeParams: true });

const registerRateLimit = rateLimit({
    windowMs: 24 * 60 * 60 * 1000,
    max: process.env.NODE_ENV === 'test' ? 10_000 : 20,
    keyGenerator: (req, res) => (req as any).user?.id || ipKeyGenerator(req.ip ?? '', false),
    message: { message: 'Daily registration limit reached (20/day).' },
    standardHeaders: true,
    legacyHeaders: false,
    // Don't count failed register attempts (4xx/5xx). A user retrying after a
    // declined card or full-event 409 isn't abusing — the limit only matters
    // for actual sustained 200s.
    skipFailedRequests: true,
});

router.get('/registrations/me', protect, getMyRegistration);
router.post('/register', protect, registerRateLimit, postRegister);
router.delete('/registrations/me', protect, deleteMyRegistration);

export default router;
