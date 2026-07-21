import crypto from 'crypto';
import OtpSession from '../models/otpSession.model';
import EmailOtpSession from '../models/emailOtpSession.model';

/**
 * Generate a cryptographically secure 6-digit OTP
 */
export const generateNumericOTP = (): string => {
    return crypto.randomInt(100000, 999999).toString();
};

/**
 * Hash the OTP using SHA256
 */
export const hashOTP = (otp: string): string => {
    return crypto.createHash('sha256').update(otp).digest('hex');
};

/**
 * Validates Phone number E.164 format roughly (e.g. +919876543210)
 */
export const isValidE164Phone = (phone: string): boolean => {
    const e164Regex = /^\+[1-9]\d{1,14}$/;
    return e164Regex.test(phone);
};

/**
 * Check if the user has requested too many OTPs recently.
 * Limit: Max 3 OTP sends per 10 minutes per phone number.
 */
export const checkRateLimit = async (phone: string): Promise<boolean> => {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

    const recentOtpsCount = await OtpSession.countDocuments({
        phone,
        createdAt: { $gte: tenMinutesAgo }
    });

    return recentOtpsCount >= 3;
};

export const isValidEmail = (email: string): boolean => {
    // Pragmatic RFC-lite check: something@something.tld
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
};

/**
 * Max 3 email codes per 10 minutes per address (mirrors checkRateLimit for phone).
 */
export const checkEmailRateLimit = async (email: string): Promise<boolean> => {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    const recent = await EmailOtpSession.countDocuments({ email, createdAt: { $gte: tenMinutesAgo } });
    return recent >= 3;
};
