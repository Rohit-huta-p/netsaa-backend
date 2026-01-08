import express from 'express';
import { registerWithEmail, loginWithEmail, registerWithPhone, verifyOtpAndLogin, getMe, updateMe } from '../controllers/auth';
import { protect } from '../middleware/auth';

const router = express.Router();

router.post('/register/email', registerWithEmail);
router.post('/login/email', loginWithEmail);
router.post('/register/phone', registerWithPhone);
router.post('/verify-otp', verifyOtpAndLogin);
router.get('/me', protect, getMe);
router.patch('/me', protect, updateMe);

export default router;