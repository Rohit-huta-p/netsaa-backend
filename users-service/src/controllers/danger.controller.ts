// src/controllers/danger.controller.ts
import { Response } from 'express';
import bcrypt from 'bcryptjs';
import User from '../models/User';
import Artist from '../models/Artist';
import Organizer from '../models/Organizer';
import Connection from '../connections/connections.model';
import Notification from '../notifications/notification.model';
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
 * Soft-delete: sets blocked + deletedAt, clears PII, preserves financial/contract records.
 * Removes from search immediately via blocked + deletedAt flags.
 * Requires password confirmation for re-auth.
 */
export const deleteAccount = async (req: AuthRequest, res: Response) => {
    try {
        const { password, reason } = req.body;

        if (!password) {
            return res.status(400).json({
                success: false,
                message: 'Password is required to delete your account',
            });
        }

        const user = await User.findById(req.user!._id).select('+passwordHash');
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // SSO accounts
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

        // Soft-delete: mark as deleted + hide from search
        // Preserve: email (for financial record lookup), role, createdAt
        // Clear: PII and profile data
        await User.findByIdAndUpdate(user._id, {
            $set: {
                blocked: true,
                deletedAt: new Date(),
                deleteReason: reason || 'User requested deletion',
                displayName: 'Deleted User',
                profileImageUrl: null,
                bio: null,
                phoneNumber: null,
                location: null,
                skills: [],
                experience: [],
                artistType: [],
                instagramHandle: null,
                galleryUrls: [],
                videoUrls: [],
                hasPhotos: false,
                devices: [],
                passwordHash: null, // invalidate login
            },
        });

        // Cascade Cleanup (Hard Delete related entities)
        // 1. Remove Artist profile
        await Artist.deleteOne({ userId: user._id });

        // 2. Remove Organizer profile
        await Organizer.deleteOne({ userId: user._id });

        // 3. Remove Connections (both directions)
        await Connection.deleteMany({
            $or: [{ requesterId: user._id }, { recipientId: user._id }],
        });

        // 4. Remove Notifications (owned by user OR triggered by user)
        await Notification.deleteMany({
            $or: [{ userId: user._id }, { actorId: user._id }],
        });

        return res.status(200).json({
            success: true,
            message: 'Account deleted. Financial and contract records have been preserved.',
        });
    } catch (error) {
        console.error('[Danger] deleteAccount error:', error);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};
