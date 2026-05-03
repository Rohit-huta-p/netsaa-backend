import { Response } from 'express';
import User from '../models/User';
import Organizer from '../models/Organizer';
import Artist from '../models/Artist';
import { AuthRequest } from '../middleware/auth';
import { notificationEvents } from '../notifications/event.emitter';

export const getUserById = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;

        // Check if ID is valid format (optional but good practice)
        if (!id.match(/^[0-9a-fA-F]{24}$/)) {
            return res.status(400).json({ msg: 'Invalid user ID' });
        }

        const user = await User.findById(id).select('-passwordHash -otp -otpExpires');

        if (!user) {
            return res.status(404).json({ msg: 'User not found' });
        }

        // Two-context model: always return both profiles
        const userObj = user.toObject() as any;
        const [artistDetails, organizerDetails] = await Promise.all([
            Artist.findOne({ userId: user._id }),
            Organizer.findOne({ userId: user._id }),
        ]);
        if (artistDetails) userObj.artistDetails = artistDetails;
        if (organizerDetails) userObj.organizerDetails = organizerDetails;

        // Plan 5 — fire profile.viewed event for non-self authenticated viewers.
        // The 24-hour idempotency bucket lives in event.emitter so a viewer
        // re-opening the same profile within the same UTC day produces no
        // additional notifications. Self-views are filtered here.
        // Fire-and-forget — never blocks the response.
        try {
            const viewer = (req as AuthRequest).user as any;
            const viewerId = viewer?._id?.toString();
            const ownerId = user._id.toString();
            if (viewerId && viewerId !== ownerId) {
                notificationEvents.emitProfileViewed({
                    profileOwnerId: ownerId,
                    viewerId,
                    viewerDisplayName:
                        viewer.displayName ||
                        [viewer.firstName, viewer.lastName].filter(Boolean).join(' ') ||
                        'Someone on NETSA',
                    viewerArtistType: viewer.artistType,
                });
            }
        } catch {
            // Notification dispatch is best-effort. Never break the read.
        }

        res.json(userObj);
    } catch (err: any) {
        console.error(err.message);
        if (err.kind === 'ObjectId') {
            return res.status(404).json({ msg: 'User not found' });
        }
        res.status(500).send('Server error');
    }
};
