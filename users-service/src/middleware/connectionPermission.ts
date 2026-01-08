import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import Conversation from '../connections/conversations.model';

export const ensureConversationAccess = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    try {
        if (!req.user) {
            return res.status(401).json({ success: false, message: 'Not authorized' });
        }

        const { conversationId } = req.params;
        const userId = req.user._id;

        const conversation = await Conversation.findById(conversationId);

        if (!conversation) {
            return res.status(404).json({ success: false, message: 'Conversation not found' });
        }

        const isParticipant = conversation.participants.some(
            (p) => p.toString() === userId.toString()
        );

        if (!isParticipant) {
            return res.status(403).json({
                success: false,
                message: 'You are not a participant in this conversation',
            });
        }

        next();
    } catch (error: any) {
        return res.status(500).json({
            success: false,
            message: 'Server error checking conversation access',
        });
    }
};
