import { Response } from 'express';
import User from '../models/User';
import { AuthRequest } from '../middleware/auth';
import { updateSettingsSchema, containsForbiddenKeys } from '../validators/settings.dto';

/* ═══════════════════════════════════════════════════
 *  Default settings template
 *  Used to fill any unset fields on read.
 * ═══════════════════════════════════════════════════ */
const DEFAULT_SETTINGS = {
    privacy: {
        profileVisibility: 'public' as const,
        showEmail: false,
        showPhone: false,
        showLocation: true,
    },
    notifications: {
        emailNotifications: true,
        pushNotifications: true,
        allowConnectionRequests: true,
        messages: true,
        gigUpdates: true,
        eventUpdates: true,
        marketing: false,
    },
    messaging: {
        allowMessagesFrom: 'connections' as const,
        readReceipts: true,
    },
    account: {
        language: 'en',
        timezone: 'Asia/Kolkata',
        currency: 'INR',
    },
};

/**
 * Deep-merge persisted Mongoose sub-doc over defaults.
 * Converts Mongoose sub-doc to plain object safely.
 */
const mergeSettings = (raw: any) => {
    const persisted = raw?.toObject ? raw.toObject() : (raw || {});
    return {
        privacy: { ...DEFAULT_SETTINGS.privacy, ...(persisted.privacy || {}) },
        notifications: { ...DEFAULT_SETTINGS.notifications, ...(persisted.notifications || {}) },
        messaging: { ...DEFAULT_SETTINGS.messaging, ...(persisted.messaging || {}) },
        account: { ...DEFAULT_SETTINGS.account, ...(persisted.account || {}) },
    };
};

/* ═══════════════════════════════════════════════════
 *  GET /users/me/settings
 *  Returns the authenticated user's normalized settings.
 * ═══════════════════════════════════════════════════ */
export const getSettings = async (req: AuthRequest, res: Response) => {
    try {
        if (!req.user) {
            return res.status(401).json({
                meta: { success: false, message: 'Not authorized' },
                data: null,
            });
        }

        const user = await User.findById(req.user._id).select('settings role');
        if (!user) {
            return res.status(404).json({
                meta: { success: false, message: 'User not found' },
                data: null,
            });
        }

        const settings = mergeSettings(user.settings);

        return res.json({
            meta: { success: true },
            data: { settings },
        });
    } catch (err: any) {
        console.error('getSettings error:', err.message);
        return res.status(500).json({
            meta: { success: false, message: 'Server error' },
            data: null,
        });
    }
};

/* ═══════════════════════════════════════════════════
 *  PATCH /users/me/settings
 *  Partially updates the authenticated user's settings.
 *
 *  Security guarantees:
 *   - Rejects forbidden top-level keys (role, kycStatus, payment, etc.)
 *   - All sub-schemas use .strict() → unknown keys rejected
 *   - Uses dot-notation $set → only provided fields mutated
 *   - Never touches Connections or Conversations collections
 *   - Messaging toggle is display-only; connection acceptance untouched
 * ═══════════════════════════════════════════════════ */
export const updateSettings = async (req: AuthRequest, res: Response) => {
    try {
        if (!req.user) {
            return res.status(401).json({
                meta: { success: false, message: 'Not authorized' },
                data: null,
            });
        }

        // ── Security: reject forbidden keys ──
        const forbidden = containsForbiddenKeys(req.body);
        if (forbidden.length > 0) {
            return res.status(403).json({
                meta: {
                    success: false,
                    message: `Forbidden fields cannot be updated via settings: ${forbidden.join(', ')}`,
                },
                data: null,
            });
        }

        // ── Validate payload via Zod ──
        const parsed = updateSettingsSchema.safeParse(req.body);
        if (!parsed.success) {
            const errors = parsed.error.flatten();
            return res.status(400).json({
                meta: { success: false, message: 'Validation failed', errors },
                data: null,
            });
        }

        const data = parsed.data;

        // ── Cross-field constraint (also checked in Zod, but also enforce
        //    against persisted state when only one side is sent) ──
        if (data.messaging?.allowMessagesFrom === 'connections') {
            // Check if allowConnectionRequests is being set to false in THIS request
            // OR is already false in the persisted settings
            const user = await User.findById(req.user._id).select('settings');
            const currentAllowCR = user?.settings?.notifications?.allowConnectionRequests ?? true;
            const incomingAllowCR = data.notifications?.allowConnectionRequests;

            const effectiveAllowCR = incomingAllowCR !== undefined ? incomingAllowCR : currentAllowCR;

            if (effectiveAllowCR === false) {
                return res.status(400).json({
                    meta: {
                        success: false,
                        message: "allowMessagesFrom cannot be 'connections' when allowConnectionRequests is disabled",
                    },
                    data: null,
                });
            }
        }

        // ── Build dot-notation $set for partial deep merge ──
        const updateFields: Record<string, any> = {};

        const sections = ['privacy', 'notifications', 'messaging', 'account'] as const;
        for (const section of sections) {
            const sectionData = data[section];
            if (sectionData) {
                for (const [key, value] of Object.entries(sectionData)) {
                    if (value !== undefined) {
                        updateFields[`settings.${section}.${key}`] = value;
                    }
                }
            }
        }

        if (Object.keys(updateFields).length === 0) {
            return res.status(400).json({
                meta: { success: false, message: 'No valid fields to update' },
                data: null,
            });
        }

        // ── Partial update (only touches settings.* paths) ──
        const updatedUser = await User.findByIdAndUpdate(
            req.user._id,
            { $set: updateFields },
            { new: true, runValidators: true }
        ).select('settings role');

        if (!updatedUser) {
            return res.status(404).json({
                meta: { success: false, message: 'User not found' },
                data: null,
            });
        }

        // Return normalized full settings object with defaults applied
        const settings = mergeSettings(updatedUser.settings);

        return res.json({
            meta: { success: true },
            data: { settings },
        });
    } catch (err: any) {
        console.error('updateSettings error:', err.message);
        return res.status(500).json({
            meta: { success: false, message: 'Server error' },
            data: null,
        });
    }
};
