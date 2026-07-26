import { Request, Response } from 'express';
import { AuthRequest } from '../../../middleware/auth';
import User from '../../../models/User';
import EmailOtpSession from '../models/emailOtpSession.model';
import { emailQueue } from '../../../email/email.queue';
import { generateNumericOTP, hashOTP, isValidEmail, checkEmailRateLimit } from '../services/otp.service';

const envelope = (status: number, message: string, data: any = null, errors: any[] = []) => ({ meta: { status, message }, data, errors });

export const sendEmailCode = async (req: AuthRequest, res: Response) => {
    try {
        if (!req.user) return res.status(401).json(envelope(401, 'Not authorized'));
        const email = String(req.body?.email ?? '').trim().toLowerCase();
        if (!isValidEmail(email)) return res.status(400).json(envelope(400, 'Enter a valid email address'));

        // Uniqueness of a VERIFIED email: block if another account already verified it.
        const takenBy = await User.findOne({ email, emailVerifiedAt: { $ne: null }, _id: { $ne: req.user._id } });
        if (takenBy) return res.status(409).json(envelope(409, 'That email is already in use.'));

        if (await checkEmailRateLimit(email)) return res.status(429).json(envelope(429, 'Too many codes requested. Please wait 10 minutes.'));

        const code = generateNumericOTP();
        const displayName = (req.user as any).displayName || 'there';
        // Provider-first: enqueue the email; if enqueue throws, do not persist a session.
        await emailQueue.add('email-verify', { userId: req.user._id.toString(), email, displayName, code });

        await EmailOtpSession.create({
            userId: req.user._id, email, codeHash: hashOTP(code),
            expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        });
        return res.status(200).json(envelope(200, 'Code sent'));
    } catch (err: any) {
        console.error('[sendEmailCode]', err.message);
        return res.status(500).json(envelope(500, 'Could not send code. Please try again.'));
    }
};

export const verifyEmailCode = async (req: AuthRequest, res: Response) => {
    try {
        if (!req.user) return res.status(401).json(envelope(401, 'Not authorized'));
        const email = String(req.body?.email ?? '').trim().toLowerCase();
        const code = String(req.body?.code ?? '').trim();
        if (!email || !code) return res.status(400).json(envelope(400, 'Email and code are required'));

        const session = await EmailOtpSession.findOne({ userId: req.user._id, email, isUsed: false }).sort({ createdAt: -1 });
        if (!session) return res.status(400).json(envelope(400, 'No active code. Please request a new one.'));
        if (session.expiresAt < new Date()) return res.status(400).json(envelope(400, 'Code expired. Please request a new one.'));
        if (session.attempts >= 5) return res.status(429).json(envelope(429, 'Too many attempts. Please request a new code.'));

        if (hashOTP(code) !== session.codeHash) {
            session.attempts += 1; await session.save();
            return res.status(400).json(envelope(400, 'Invalid code. Please try again.'));
        }
        const burned = await EmailOtpSession.findOneAndUpdate({ _id: session._id, isUsed: false }, { $set: { isUsed: true } });
        if (!burned) return res.status(400).json(envelope(400, 'This code was already used.'));

        const user: any = await User.findById(req.user._id);
        user.email = email;
        user.emailVerifiedAt = new Date();
        if (user.phoneVerifiedAt && (user.kycLevel ?? 0) < 1) user.kycLevel = 1; // Global Constraint
        await user.save();

        const userObj = user.toObject();
        delete userObj.passwordHash; delete userObj.otp; delete userObj.otpExpires;
        return res.status(200).json(envelope(200, 'Email verified', userObj));
    } catch (err: any) {
        console.error('[verifyEmailCode]', err.message);
        return res.status(500).json(envelope(500, 'Could not verify. Please try again.'));
    }
};
