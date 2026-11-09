import { Response } from 'express';
import FollowsService from './follows.service';
import { AuthRequest } from '../middleware/auth';

class FollowsController {
    async follow(req: AuthRequest, res: Response) {
        try {
            if (!req.user) {
                return res.status(401).json({ success: false, message: 'Not authorized' });
            }
            const followerId = req.user._id.toString();
            const { userId } = req.params;

            const state = await FollowsService.follow(followerId, userId);
            return res.status(200).json({ success: true, data: state });
        } catch (error: any) {
            // Honor a FollowError's status (400 self-follow); fall back to 400.
            return res.status(error?.status ?? 400).json({ success: false, message: error.message });
        }
    }

    async unfollow(req: AuthRequest, res: Response) {
        try {
            if (!req.user) {
                return res.status(401).json({ success: false, message: 'Not authorized' });
            }
            const followerId = req.user._id.toString();
            const { userId } = req.params;

            const state = await FollowsService.unfollow(followerId, userId);
            return res.status(200).json({ success: true, data: state });
        } catch (error: any) {
            return res.status(error?.status ?? 400).json({ success: false, message: error.message });
        }
    }

    async status(req: AuthRequest, res: Response) {
        try {
            if (!req.user) {
                return res.status(401).json({ success: false, message: 'Not authorized' });
            }
            const followerId = req.user._id.toString();
            const { userId } = req.params;

            const state = await FollowsService.getStatus(followerId, userId);
            return res.status(200).json({ success: true, data: state });
        } catch (error: any) {
            return res.status(error?.status ?? 400).json({ success: false, message: error.message });
        }
    }
}

export default new FollowsController();
