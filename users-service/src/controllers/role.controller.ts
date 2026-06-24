// src/controllers/role.controller.ts
import { Response } from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User';
import { AuthRequest } from '../middleware/auth';

const VALID_ROLES = ['client', 'creative_lead', 'artist'] as const;
type Role = (typeof VALID_ROLES)[number];

/**
 * POST /api/users/me/role
 * Reversible role switch (three-role marketplace model).
 * roleChangedAt is stored on every switch so a future N-day cooling-off
 * lock is a one-line check here. Re-issues the JWT because gigs-service
 * and search-service enforce the visibility wall from the token's role.
 */
export const switchRole = async (req: AuthRequest, res: Response) => {
    try {
        const { role } = req.body as { role?: Role };
        if (!role || !VALID_ROLES.includes(role)) {
            return res.status(400).json({
                success: false,
                message: `role must be one of: ${VALID_ROLES.join(', ')}`,
            });
        }

        const user = await User.findByIdAndUpdate(
            req.user!._id,
            { $set: { role, roleChangedAt: new Date() } },
            { new: true, runValidators: true },
        );
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // Same payload shape as login/register (auth.ts)
        const payload = {
            user: {
                id: user.id,
                role: user.role,
                displayName: user.displayName,
                email: user.email,
                profileImageUrl: user.profileImageUrl,
                primaryCity: user.cached?.primaryCity,
                kycStatus: user.kycStatus,
            },
        };
        const token = jwt.sign(payload, process.env.JWT_SECRET as string, { expiresIn: 360000 });

        const userObj: any = typeof user.toObject === 'function' ? user.toObject() : user;
        delete userObj.passwordHash;

        return res.status(200).json({
            success: true,
            data: { token, user: { ...userObj, id: user.id ?? userObj._id, role: user.role } },
        });
    } catch (error) {
        console.error('[Role] switchRole error:', error);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};
