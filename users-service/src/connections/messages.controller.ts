import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import MessagesService from './messages.service';

class MessagesController {
    async sendMessage(req: AuthRequest, res: Response) {
        try {
            if (!req.user) {
                return res.status(401).json({ success: false, message: 'Not authorized' });
            }

            const { conversationId } = req.params;
            const { text, attachments, clientMessageId } = req.body;
            const senderId = req.user._id.toString();

            const message = await MessagesService.sendMessage({
                conversationId,
                senderId,
                text,
                attachments,
                clientMessageId,
            });


            // Optimistic UI Support:
            // We return the full created message, including the server-generated `_id` 
            // and the `clientMessageId` passed in the request.
            // 
            // The client should use the `clientMessageId` to find its temporary local message
            // and replace it with this confirmed server message (reconciliation).

            // Emit socket event for real-time delivery
            const { emitNewMessage } = await import('../sockets/messaging.socket');
            emitNewMessage(conversationId, message);

            return res.status(201).json({
                success: true,
                data: message,
            });
        } catch (error: any) {
            return res.status(400).json({
                success: false,
                message: error.message,
            });
        }
    }

    async getMessages(req: AuthRequest, res: Response) {
        try {
            if (!req.user) {
                return res.status(401).json({ success: false, message: 'Not authorized' });
            }

            const { conversationId } = req.params;
            const userId = req.user._id.toString();
            const { cursor, limit } = req.query;

            const messages = await MessagesService.getMessages(
                conversationId,
                userId,
                cursor as string,
                limit ? parseInt(limit as string) : 30
            );

            return res.status(200).json({
                success: true,
                data: messages,
            });
        } catch (error: any) {
            return res.status(400).json({
                success: false,
                message: error.message,
            });
        }
    }

    async markSeen(req: AuthRequest, res: Response) {
        try {
            if (!req.user) {
                return res.status(401).json({ success: false, message: 'Not authorized' });
            }

            const { conversationId } = req.params;
            const userId = req.user._id.toString();

            await MessagesService.markMessagesSeen(conversationId, userId);

            // Emit socket event
            const { emitMessageSeen } = await import('../sockets/messaging.socket');
            emitMessageSeen(conversationId, userId);

            return res.status(200).json({
                success: true,
            });
        } catch (error: any) {
            return res.status(400).json({
                success: false,
                message: error.message,
            });
        }
    }
}

export default new MessagesController();
