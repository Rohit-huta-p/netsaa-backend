import express from 'express';
import rateLimit from 'express-rate-limit';
import { registerWithEmail, loginWithEmail, getMe, updateMe, checkEmail, checkPhone, forgotPassword, resetPassword } from '../controllers/auth';
import { sendOtp, verifyOtp } from '../modules/auth/controllers/otp.controller';
import { protect } from '../middleware/auth';

const router = express.Router();

// Per-phone: one number can't be hammered (10/min). Per-IP: one device can't
// spray OTPs across many numbers (30/min) — SMS-pumping is a real cost attack.
const otpSendPhoneLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => `phone:${String(req.body?.phone ?? '').slice(0, 32)}`,
    message: { meta: { status: 429, message: 'Too many OTP requests. Try again in a minute.' }, data: null, errors: [] },
});
const otpSendIpLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { meta: { status: 429, message: 'Too many OTP requests. Try again in a minute.' }, data: null, errors: [] },
});

router.post('/register/email', registerWithEmail);
router.post('/login/email', loginWithEmail);
router.post('/check-email', checkEmail);
router.post('/check-phone', checkPhone);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

// New unified OTP authentication routes
router.post('/send-otp', otpSendIpLimiter, otpSendPhoneLimiter, sendOtp);
router.post('/verify-otp', verifyOtp);

router.get('/me', protect, getMe);
router.patch('/me', protect, updateMe);

export default router;