import { Response } from 'express';
import ConversationsService from './conversations.service';
import { AuthRequest } from '../middleware/auth';

class ConversationsController {
    async listConversations(req: AuthRequest, res: Response) {
        try {
            if (!req.user) {
                return res.status(401).json({ success: false, message: 'Not authorized' });
            }

            const userId = req.user._id.toString();
            const conversations = await ConversationsService.listUserConversations(userId);

            return res.status(200).json({
                success: true,
                data: conversations,
            });
        } catch (error: any) {
            return res.status(400).json({
                success: false,
                message: error.message,
            });
        }
    }

    async createConversation(req: AuthRequest, res: Response) {
        try {
            if (!req.user) {
                return res.status(401).json({ success: false, message: 'Not authorized' });
            }

            const { recipientId } = req.body;
            if (!recipientId) {
                return res.status(400).json({ success: false, message: 'Recipient ID is required' });
            }

            const conversation = await ConversationsService.createConversation(req.user._id.toString(), recipientId);

            return res.status(201).json({
                success: true,
                data: conversation
            });
        } catch (error: any) {
            return res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }

    async getConversationById(req: AuthRequest, res: Response) {
        try {
            const { id } = req.params;
            const conversation = await ConversationsService.getConversationById(id);

            if (!conversation) {
                return res.status(404).json({ success: false, message: 'Conversation not found' });
            }

            return res.status(200).json({
                success: true,
                data: conversation
            });
        } catch (error: any) {
            return res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }
}

export default new ConversationsController();
