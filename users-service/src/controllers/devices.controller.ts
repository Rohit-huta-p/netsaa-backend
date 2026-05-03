/**
 * Device-token registration controller.
 *
 * Endpoints:
 *   POST   /api/users/me/devices       — register or refresh a device's push token
 *   GET    /api/users/me/devices        — list this user's registered devices (no tokens returned)
 *   DELETE /api/users/me/devices/:id    — unregister a device by deviceId
 *
 * Storage: User.devices[] sub-document array. The client passes a stable
 * deviceId (per-install UUID kept in SecureStore) so re-registering the
 * same device updates its token in place rather than spawning duplicates.
 *
 * Tokens themselves rotate (FCM / APNs sometimes invalidate and reissue),
 * so the client should call POST /devices on every cold-start AND every
 * token-refresh callback.
 */

import { Response } from 'express';
import User from '../models/User';
import { AuthRequest } from '../middleware/auth';

// Loose runtime validation — the controller doesn't pull in zod here to
// keep the endpoint light. Schema enforcement still happens on save.
function isValidPlatform(p: any): p is 'ios' | 'android' | 'web' {
    return p === 'ios' || p === 'android' || p === 'web';
}

/**
 * POST /api/users/me/devices
 *
 * Body:
 *   {
 *     deviceId:   string  (required — stable per-install id)
 *     platform:   'ios' | 'android' | 'web'  (required)
 *     pushToken:  string  (required — FCM / APNs / Web Push token)
 *     appVersion: string  (optional — for diagnostics)
 *   }
 *
 * Behavior:
 *   - If a device with the same `deviceId` already exists for this user,
 *     update its `pushToken`, `lastActive`, `appVersion`, and clear
 *     `revoked`.
 *   - Else append a new device entry with `registeredAt = now`.
 *
 * Always returns 200 with the (sanitized) updated devices list.
 */
export async function registerDevice(req: AuthRequest, res: Response): Promise<Response> {
    if (!req.user) {
        return res.status(401).json({ message: 'Not authorized' });
    }

    const { deviceId, platform, pushToken, appVersion } = req.body || {};

    if (!deviceId || typeof deviceId !== 'string' || deviceId.length > 128) {
        return res
            .status(400)
            .json({ message: 'deviceId is required (string, ≤128 chars)' });
    }
    if (!isValidPlatform(platform)) {
        return res
            .status(400)
            .json({ message: 'platform must be ios | android | web' });
    }
    if (!pushToken || typeof pushToken !== 'string' || pushToken.length > 4096) {
        return res
            .status(400)
            .json({ message: 'pushToken is required (string, ≤4096 chars)' });
    }
    if (
        appVersion !== undefined &&
        (typeof appVersion !== 'string' || appVersion.length > 32)
    ) {
        return res
            .status(400)
            .json({ message: 'appVersion must be a string ≤32 chars' });
    }

    try {
        const userId = (req.user as any)._id;
        const now = new Date();

        // Upsert by deviceId. We do this in two MongoDB ops to keep the
        // logic straightforward and avoid a complex array-filter $set:
        //   1. Try $set on the matching sub-doc (positional update).
        //   2. If that didn't match, $push a new entry.
        // Race-safe enough for a per-user write — concurrent registers
        // for the same deviceId converge.
        const updated = await User.findOneAndUpdate(
            { _id: userId, 'devices.deviceId': deviceId },
            {
                $set: {
                    'devices.$.pushToken': pushToken,
                    'devices.$.platform': platform,
                    'devices.$.lastActive': now,
                    'devices.$.appVersion': appVersion,
                    'devices.$.revoked': false,
                },
            },
            { new: true }
        ).lean();

        if (!updated) {
            // Sub-doc didn't exist — push a fresh row.
            await User.findByIdAndUpdate(
                userId,
                {
                    $push: {
                        devices: {
                            deviceId,
                            platform,
                            pushToken,
                            appVersion,
                            registeredAt: now,
                            lastActive: now,
                            revoked: false,
                        },
                    },
                },
                { new: true }
            ).lean();
        }

        const fresh = await User.findById(userId)
            .select('devices')
            .lean();

        return res.status(200).json({
            data: { devices: sanitize(fresh?.devices ?? []) },
            message: 'Device registered',
        });
    } catch (err: any) {
        console.error('[registerDevice]', err?.message ?? err);
        return res
            .status(500)
            .json({ message: 'Failed to register device' });
    }
}

/**
 * GET /api/users/me/devices
 *
 * Returns this user's registered devices. Push tokens are NEVER
 * returned — the client doesn't need them and we treat them as
 * sensitive credentials.
 */
export async function listMyDevices(req: AuthRequest, res: Response): Promise<Response> {
    if (!req.user) {
        return res.status(401).json({ message: 'Not authorized' });
    }
    try {
        const fresh = await User.findById((req.user as any)._id)
            .select('devices')
            .lean();
        return res.status(200).json({
            data: { devices: sanitize(fresh?.devices ?? []) },
        });
    } catch (err: any) {
        console.error('[listMyDevices]', err?.message ?? err);
        return res.status(500).json({ message: 'Failed to fetch devices' });
    }
}

/**
 * DELETE /api/users/me/devices/:deviceId
 *
 * Removes the device entry from User.devices[]. Used by the client at
 * logout and from a "manage devices" settings screen.
 */
export async function unregisterDevice(req: AuthRequest, res: Response): Promise<Response> {
    if (!req.user) {
        return res.status(401).json({ message: 'Not authorized' });
    }
    const { deviceId } = req.params;
    if (!deviceId || typeof deviceId !== 'string') {
        return res.status(400).json({ message: 'deviceId is required' });
    }
    try {
        const userId = (req.user as any)._id;
        await User.findByIdAndUpdate(
            userId,
            { $pull: { devices: { deviceId } } },
            { new: true }
        );
        return res.status(200).json({ message: 'Device unregistered' });
    } catch (err: any) {
        console.error('[unregisterDevice]', err?.message ?? err);
        return res
            .status(500)
            .json({ message: 'Failed to unregister device' });
    }
}

/**
 * Strip pushToken (sensitive) before sending devices back to the client.
 * Keeps the rest of the metadata for the "manage devices" UI.
 */
function sanitize(devices: any[]): any[] {
    return devices.map((d: any) => ({
        _id: d._id,
        deviceId: d.deviceId,
        platform: d.platform,
        appVersion: d.appVersion,
        registeredAt: d.registeredAt,
        lastActive: d.lastActive,
        revoked: d.revoked ?? false,
    }));
}
