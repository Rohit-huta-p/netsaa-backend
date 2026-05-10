import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { protect } from '../middleware/auth';
import { postRegister, deleteMyRegistration } from '../controllers/registrations.controller';

const router = Router({ mergeParams: true });

const registerRateLimit = rateLimit({
    windowMs: 24 * 60 * 60 * 1000,
    max: process.env.NODE_ENV === 'test' ? 10_000 : 5,
    keyGenerator: (req) => (req as any).user?.id || req.ip,
    message: { message: 'Daily registration limit reached (5/day).' },
    standardHeaders: true,
    legacyHeaders: false,
});

router.post('/register', protect, registerRateLimit, postRegister);
router.delete('/registrations/me', protect, deleteMyRegistration);

export default router;
