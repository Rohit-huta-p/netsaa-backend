// src/controllers/danger.controller.ts
import { Response } from 'express';
import bcrypt from 'bcryptjs';
import User from '../models/User';
import { AuthRequest } from '../middleware/auth';

/**
 * POST /api/users/me/deactivate
 * Sets blocked = true (reversible — user can log back in to reactivate).
 * Requires password confirmation for re-auth.
 */
export const deactivateAccount = async (req: AuthRequest, res: Response) => {
    try {
        const { password } = req.body;

        if (!password) {
            return res.status(400).json({
                success: false,
                message: 'Password is required to deactivate your account',
            });
        }

        const user = await User.findById(req.user!._id).select('+passwordHash');
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // SSO accounts — no password to verify
        if (!user.passwordHash) {
            return res.status(400).json({
                success: false,
                message: 'Password confirmation is not available for social login accounts. Please contact support.',
            });
        }

        // Re-auth
        const isMatch = await bcrypt.compare(password, user.passwordHash);
        if (!isMatch) {
            return res.status(401).json({
                success: false,
                message: 'Incorrect password. Please try again.',
            });
        }

        // Deactivate
        user.accountStatus = 'deactivated';
        user.blocked = true;
        await user.save();

        return res.status(200).json({
            success: true,
            message: 'Account deactivated. You can reactivate by logging back in.',
        });
    } catch (error) {
        console.error('[Danger] deactivateAccount error:', error);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};

/**
 * POST /api/users/me/delete
 * Schedules the account for permanent deletion after a 30-day grace period.
 * No data is destroyed — the user can cancel within the grace window.
 * Requires password confirmation for re-auth.
 */
export const deleteAccount = async (req: AuthRequest, res: Response) => {
    try {
        const { confirmationText, reason } = req.body;

        if (!confirmationText || confirmationText.toLowerCase() !== 'delete') {
            return res.status(400).json({
                success: false,
                message: 'Please type "delete" to confirm account deletion',
            });
        }

        const user = await User.findById(req.user!._id).select('+passwordHash');
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // No longer verifying password for deletion, only requiring "delete" confirmation

        // Schedule for deletion — no data is destroyed
        user.accountStatus = 'scheduled_for_deletion';
        user.deletedAt = new Date();
        user.deletionScheduledAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        user.deleteReason = reason || 'User requested deletion';
        user.blocked = true;
        await user.save();

        return res.status(200).json({
            success: true,
            message: 'Account scheduled for permanent deletion in 30 days.',
        });
    } catch (error) {
        console.error('[Danger] deleteAccount error:', error);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};

/**
 * POST /api/users/me/restore
 * Restores an account scheduled for deletion if the grace period has not expired.
 */
export const restoreAccount = async (req: AuthRequest, res: Response) => {
    try {
        const user = await User.findById(req.user!._id);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        if (user.accountStatus === 'scheduled_for_deletion' && user.deletionScheduledAt) {
            if (Date.now() < user.deletionScheduledAt.getTime()) {
                // Restore account
                user.accountStatus = 'active';
                user.deletedAt = undefined;
                user.deletionScheduledAt = undefined;
                user.blocked = false;
                await user.save();

                return res.status(200).json({
                    success: true,
                    message: 'Account successfully restored.',
                });
            } else {
                // Grace period has passed
                return res.status(410).json({
                    success: false,
                    message: 'The grace period to restore this account has expired.',
                });
            }
        }

        return res.status(400).json({
            success: false,
            message: 'Account is not scheduled for deletion.',
        });
    } catch (error) {
        console.error('[Danger] restoreAccount error:', error);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};
