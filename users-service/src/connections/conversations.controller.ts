import { Response } from 'express';
import ConversationsService from './conversations.service';
import Conversation from './conversations.model';
import Message from './messages.model';
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

            const { recipientId, context, seedText } = req.body as {
                recipientId?: string;
                context?: { requirementId?: string; proposalId?: string; label?: string; inviteId?: string };
                seedText?: string;
            };
            if (!recipientId) {
                return res.status(400).json({ success: false, message: 'Recipient ID is required' });
            }

            const userId = req.user._id;

            let conversation = await Conversation.findOne({ participants: { $all: [userId, recipientId] } });
            let created = false;
            if (!conversation) {
                conversation = await Conversation.create({
                    participants: [userId, recipientId],
                    ...(context ? { context } : {}),
                });
                created = true;
                // System seed — only on a fresh, context-anchored (Choose-originated) thread.
                if (context && seedText) {
                    await Message.create({
                        conversationId: conversation._id,
                        senderId: userId,
                        text: seedText,
                        system: true,
                    });
                    conversation.lastMessage = seedText;
                    conversation.lastMessageAt = new Date();
                    await conversation.save();
                }
            } else if (context && !conversation.context) {
                // Backfill context if the pair already had a plain DM.
                conversation.context = context as any;
                await conversation.save();
            }

            const populated = await conversation.populate('participants', 'displayName profileImageUrl role');
            return res.status(created ? 201 : 200).json({ success: true, data: populated });
        } catch (error: any) {
            console.error('[Conversations] create error:', error);
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
