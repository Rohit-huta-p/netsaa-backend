import { Request, Response } from 'express';
import ConnectionsService from './connections.service';
import { AuthRequest } from '../middleware/auth';

class ConnectionsController {
    async sendConnectionRequest(req: AuthRequest, res: Response) {
        try {
            if (!req.user) {
                return res.status(401).json({ success: false, message: 'Not authorized' });
            }

            const { recipientId, message } = req.body;

            const requesterId = req.user._id.toString();

            const connection = await ConnectionsService.sendRequest(
                requesterId,
                recipientId,
                message
            );

            return res.status(201).json({
                success: true,
                data: connection,
            });
        } catch (error: any) {
            return res.status(400).json({
                success: false,
                message: error.message,
            });
        }
    }

    async acceptConnection(req: AuthRequest, res: Response) {
        try {
            if (!req.user) {
                return res.status(401).json({ success: false, message: 'Not authorized' });
            }

            const { connectionId } = req.params;
            const currentUserId = req.user._id.toString();

            const result = await ConnectionsService.acceptRequest(
                connectionId,
                currentUserId
            );

            return res.status(200).json({
                success: true,
                data: result,
            });
        } catch (error: any) {
            return res.status(400).json({
                success: false,
                message: error.message,
            });
        }
    }

    async rejectConnection(req: AuthRequest, res: Response) {
        try {
            if (!req.user) {
                return res.status(401).json({ success: false, message: 'Not authorized' });
            }

            const { connectionId } = req.params;
            const currentUserId = req.user._id.toString();

            const connection = await ConnectionsService.rejectRequest(
                connectionId,
                currentUserId
            );

            return res.status(200).json({
                success: true,
                data: connection,
            });
        } catch (error: any) {
            return res.status(400).json({
                success: false,
                message: error.message,
            });
        }
    }

    async blockConnection(req: AuthRequest, res: Response) {
        try {
            if (!req.user) {
                return res.status(401).json({ success: false, message: 'Not authorized' });
            }

            const { connectionId } = req.params;
            const currentUserId = req.user._id.toString();

            const connection = await ConnectionsService.blockUser(
                connectionId,
                currentUserId
            );

            return res.status(200).json({
                success: true,
                data: connection,
            });
        } catch (error: any) {
            return res.status(400).json({
                success: false,
                message: error.message,
            });
        }
    }

    async listConnections(req: AuthRequest, res: Response) {
        try {
            if (!req.user) {
                return res.status(401).json({ success: false, message: 'Not authorized' });
            }

            const userId = req.user._id.toString();
            const connections = await ConnectionsService.listAcceptedConnections(userId);

            return res.status(200).json({
                success: true,
                data: connections,
            });
        } catch (error: any) {
            return res.status(400).json({
                success: false,
                message: error.message,
            });
        }
    }

    async listRequests(req: AuthRequest, res: Response) {
        try {
            if (!req.user) {
                return res.status(401).json({ success: false, message: 'Not authorized' });
            }

            const userId = req.user._id.toString();
            const requests = await ConnectionsService.listPendingRequests(userId);

            return res.status(200).json({
                success: true,
                data: requests,
            });
        } catch (error: any) {
            return res.status(400).json({
                success: false,
                message: error.message,
            });
        }
    }

    async listSentRequests(req: AuthRequest, res: Response) {
        try {
            if (!req.user) {
                return res.status(401).json({ success: false, message: 'Not authorized' });
            }

            const userId = req.user._id.toString();
            const requests = await ConnectionsService.listSentRequests(userId);

            return res.status(200).json({
                success: true,
                data: requests,
            });
        } catch (error: any) {
            return res.status(400).json({
                success: false,
                message: error.message,
            });
        }
    }
}

export default new ConnectionsController();
