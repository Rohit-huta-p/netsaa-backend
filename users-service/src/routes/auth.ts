import express from 'express';
import { registerWithEmail, loginWithEmail, getMe, updateMe, checkEmail, checkPhone, forgotPassword, resetPassword } from '../controllers/auth';
import { sendOtp, verifyOtp } from '../modules/auth/controllers/otp.controller';
import { protect } from '../middleware/auth';

const router = express.Router();

router.post('/register/email', registerWithEmail);
router.post('/login/email', loginWithEmail);
router.post('/check-email', checkEmail);
router.post('/check-phone', checkPhone);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

// New unified OTP authentication routes
router.post('/send-otp', sendOtp);
router.post('/verify-otp', verifyOtp);

router.get('/me', protect, getMe);
router.patch('/me', protect, updateMe);

export default router;