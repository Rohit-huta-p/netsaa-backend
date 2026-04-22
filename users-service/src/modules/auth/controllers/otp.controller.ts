import { Request, Response } from 'express';
import {
    generateNumericOTP,
    hashOTP,
    isValidE164Phone,
    checkRateLimit
} from '../services/otp.service';
import { sendSms } from '../../../services/sms.service';
import OtpSession from '../models/otpSession.model';
import User from '../../../models/User';
import jwt from 'jsonwebtoken';


/**
 * @desc    Send OTP to a phone number
 * @route   POST /api/users/auth/send-otp
 * @access  Public
 *
 * Flow hint: The response includes a `flow` field ("login" | "register")
 * so the frontend can pre-determine navigation before OTP verification.
 * No user is created at this stage.
 */
export const sendOtp = async (req: Request, res: Response) => {
    try {
        const { phone } = req.body;

        // 1. Basic validation
        if (!phone) {
            return res.status(400).json({
                meta: { status: 400, message: 'Phone number is required' },
                data: null,
                errors: [{ field: 'phone', message: 'Phone number is required' }],
            });
        }

        if (!isValidE164Phone(phone)) {
            return res.status(400).json({
                meta: { status: 400, message: 'Phone number must be in E.164 format (e.g. +919876543210)' },
                data: null,
                errors: [{ field: 'phone', message: 'Invalid E.164 format' }],
            });
        }

        // 2. Check rate limit explicitly
        const isRateLimited = await checkRateLimit(phone);
        if (isRateLimited) {
            return res.status(429).json({
                meta: { status: 429, message: 'Too many OTP requests. Please wait 10 minutes.' },
                data: null,
                errors: [],
            });
        }

        // 3. Generate 6-digit number OTP + calculate Hash
        const otp = generateNumericOTP();
        const otpHash = hashOTP(otp);

        // 4. Send the OTP (Wait for provider response before saving to DB)
        const message = `Your NETSA login code is: ${otp}.`;
        const smsSent = await sendSms(phone, message);

        if (!smsSent) {
            return res.status(500).json({
                meta: { status: 500, message: 'Failed to send OTP via SMS provider. Please try again.' },
                data: null,
                errors: [],
            });
        }

        // 5. Save the session to DB
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes validity

        const newSession = new OtpSession({
            phone,
            otpHash,
            expiresAt,
            attempts: 0,
            isUsed: false,
        });
        await newSession.save();

        // 6. Determine flow hint — check if user already exists
        //    This does NOT create a user; it only informs the frontend
        //    whether the upcoming verify-otp will be a login or a registration.
        const existingUser = await User.findOne({ phoneNumber: phone }).select('_id').lean();
        const flow: 'login' | 'register' = existingUser ? 'login' : 'register';

        // 5. Respond with envelope + flow hint
        return res.status(200).json({
            meta: { status: 200, message: 'OTP sent successfully' },
            data: {
                flow,
                expiresAt: newSession.expiresAt,  // Useful for frontend countdowns
            },
            errors: [],
        });

    } catch (error: any) {
        console.error('[sendOtp] Controller Error:', error.message);
        return res.status(500).json({
            meta: { status: 500, message: 'Internal server error while sending OTP' },
            data: null,
            errors: [{ message: error.message }],
        });
    }
};

/**
 * @desc    Verify OTP and Login (existing users only)
 * @route   POST /api/users/auth/verify-otp
 * @access  Public
 *
 * Boundaries:
 *   - Identity Verification: OTP session lookup, expiry check, attempt limiting, hash comparison.
 *   - Login Boundary:        Existing user lookup, reactivation of deactivated accounts, JWT issuance.
 *   - Registration Boundary: NOT handled here. If the phone number has no associated user,
 *                            the client receives a 404 and must direct the user to a registration flow.
 */
export const verifyOtp = async (req: Request, res: Response) => {
    try {
        const { phone, otp } = req.body;

        if (!phone || !otp) {
            return res.status(400).json({
                meta: { status: 400, message: 'Phone number and OTP are required' },
                data: null,
                errors: [{ field: 'phone/otp', message: 'Both phone and otp fields are required' }],
            });
        }

        // ──────────────────────────────────────────────
        // IDENTITY VERIFICATION BOUNDARY
        // Validate the OTP session: existence, expiry, attempts, hash.
        // ──────────────────────────────────────────────

        // 1. Find the latest unused OTP session for this phone number
        const session = await OtpSession.findOne({
            phone,
            isUsed: false,
        }).sort({ createdAt: -1 });

        // 2. Session validations
        if (!session) {
            return res.status(400).json({
                meta: { status: 400, message: 'No active OTP session found. Please request a new OTP.' },
                data: null,
                errors: [],
            });
        }

        if (session.expiresAt < new Date()) {
            return res.status(400).json({
                meta: { status: 400, message: 'OTP has expired. Please request a new one.' },
                data: null,
                errors: [],
            });
        }

        if (session.attempts >= 3) {
            return res.status(429).json({
                meta: { status: 429, message: 'Maximum attempts reached. Please request a new OTP.' },
                data: null,
                errors: [],
            });
        }

        // 3. Hash the incoming OTP and compare
        const incomingHash = hashOTP(otp.toString());

        if (incomingHash !== session.otpHash) {
            session.attempts += 1;
            await session.save();
            return res.status(400).json({
                meta: { status: 400, message: 'Invalid OTP. Please try again.' },
                data: null,
                errors: [],
            });
        }

        // 4. Valid OTP — mark session as used
        session.isUsed = true;
        await session.save();

        // ──────────────────────────────────────────────
        // REGISTRATION BOUNDARY (guard)
        // If the phone number is not associated with an existing user,
        // return 404 so the client can redirect to a registration flow.
        // No user is silently created here.
        // ──────────────────────────────────────────────

        // 5. Lookup existing user by phone number
        const user = await User.findOne({ phoneNumber: phone });

        if (!user) {
            console.log(`[verifyOtp] No account found for phone: ${phone}`);
            return res.status(404).json({
                meta: { status: 404, message: 'Account not found' },
                data: {
                    userExists: false,
                    phoneNumber: phone,
                },
                errors: [],
            });
        }

        // ──────────────────────────────────────────────
        // LOGIN BOUNDARY
        // User exists — reactivate if needed, issue JWT.
        // ──────────────────────────────────────────────

        // 6. Reactivate deactivated accounts on successful login
        if (user.accountStatus === 'deactivated') {
            user.accountStatus = 'active';
            user.blocked = false;
            await user.save();
            console.log(`[verifyOtp] Reactivated user for phone: ${phone}`);
        }

        console.log(`[verifyOtp] Login successful for phone: ${phone}`);

        // 7. Generate JWT payload (two-context model — PRD v4)
        const payload = {
            user: {
                id: user.id,
                contexts: user.contexts,
                isAdmin: user.isAdmin,
                displayName: user.displayName,
                email: user.email,
                profileImageUrl: user.profileImageUrl,
                primaryCity: user.cached?.primaryCity,
                trustTier: user.trustTier,
                kycLevel: user.kycLevel,
                isMinor: user.isMinor ?? false,
                guardianStatus: user.guardianStatus ?? 'none',
            },
        };

        // 8. Sign token & return structured response
        jwt.sign(
            payload,
            process.env.JWT_SECRET as string,
            { expiresIn: 360000 },
            (err, token) => {
                if (err) throw err;
                return res.status(200).json({
                    meta: { status: 200, message: 'Login successful' },
                    data: {
                        userExists: true,
                        token,
                        user: { ...user.toObject(), id: user.id },
                    },
                    errors: [],
                });
            }
        );

    } catch (error: any) {
        console.error('[verifyOtp] Controller Error:', error.message);
        return res.status(500).json({
            meta: { status: 500, message: 'Internal server error while verifying OTP' },
            data: null,
            errors: [{ message: error.message }],
        });
    }
};

