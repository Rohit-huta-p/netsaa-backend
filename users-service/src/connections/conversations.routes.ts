import express from 'express';
import { protect } from '../middleware/auth';
import ConversationsController from './conversations.controller';

const router = express.Router();

console.log('Registering conversations routes');
router.get('/', protect, ConversationsController.listConversations);
router.post('/', protect, ConversationsController.createConversation);
router.get('/:id', protect, ConversationsController.getConversationById);

export default router;
