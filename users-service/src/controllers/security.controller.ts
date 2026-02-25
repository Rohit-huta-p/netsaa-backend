// src/controllers/security.controller.ts
import { Response } from 'express';
import bcrypt from 'bcryptjs';
import User from '../models/User';
import { AuthRequest } from '../middleware/auth';

/**
 * POST /api/users/me/change-password
 * Requires re-auth via currentPassword.
 */
export const changePassword = async (req: AuthRequest, res: Response) => {
    try {
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({
                success: false,
                message: 'Both currentPassword and newPassword are required',
            });
        }

        if (newPassword.length < 8) {
            return res.status(400).json({
                success: false,
                message: 'New password must be at least 8 characters',
            });
        }

        const user = await User.findById(req.user!._id).select('+passwordHash');
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // SSO-only accounts don't have a password
        if (!user.passwordHash) {
            return res.status(400).json({
                success: false,
                message: 'Password change is not available for social login accounts',
            });
        }

        // Re-auth: verify current password
        const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
        if (!isMatch) {
            return res.status(401).json({
                success: false,
                message: 'Re-authentication failed. Current password is incorrect.',
            });
        }

        // Hash and save new password
        const salt = await bcrypt.genSalt(12);
        user.passwordHash = await bcrypt.hash(newPassword, salt);
        await user.save();

        return res.status(200).json({
            success: true,
            message: 'Password changed successfully',
        });
    } catch (error) {
        console.error('[Security] changePassword error:', error);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};

/**
 * GET /api/users/me/sessions
 * Returns the user's active devices.
 */
export const getActiveSessions = async (req: AuthRequest, res: Response) => {
    try {
        const user = await User.findById(req.user!._id).select('devices');
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        return res.status(200).json({
            success: true,
            data: { devices: user.devices ?? [] },
        });
    } catch (error) {
        console.error('[Security] getActiveSessions error:', error);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};

/**
 * DELETE /api/users/me/sessions/:deviceId
 * Removes a specific device from the devices array.
 */
export const logoutDevice = async (req: AuthRequest, res: Response) => {
    try {
        const { deviceId } = req.params;

        const result = await User.findByIdAndUpdate(
            req.user!._id,
            { $pull: { devices: { _id: deviceId } } },
            { new: true, select: 'devices' },
        );

        if (!result) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        return res.status(200).json({
            success: true,
            message: 'Device logged out',
            data: { devices: result.devices ?? [] },
        });
    } catch (error) {
        console.error('[Security] logoutDevice error:', error);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};

/**
 * DELETE /api/users/me/sessions
 * Clears ALL devices (logout all).
 */
export const logoutAllDevices = async (req: AuthRequest, res: Response) => {
    try {
        const result = await User.findByIdAndUpdate(
            req.user!._id,
            { $set: { devices: [] } },
            { new: true, select: 'devices' },
        );

        if (!result) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        return res.status(200).json({
            success: true,
            message: 'All devices logged out',
            data: { devices: [] },
        });
    } catch (error) {
        console.error('[Security] logoutAllDevices error:', error);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};
