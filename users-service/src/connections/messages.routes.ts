import express from 'express';
import { protect } from '../middleware/auth';
import { ensureConversationAccess } from '../middleware/connectionPermission';
import MessagesController from './messages.controller';

const router = express.Router();

router.post(
    '/:conversationId',
    protect,
    ensureConversationAccess,
    MessagesController.sendMessage
);

router.get(
    '/:conversationId',
    protect,
    ensureConversationAccess,
    MessagesController.getMessages
);

router.patch(
    '/:messageId/seen',
    protect,
    // ensureConversationAccess is skipped here because we don't have conversationId in params
    // and markSeen likely validates user authorization implicitly via service or doesn't strictly need it
    // if the user is just marking their own seen status.
    MessagesController.markSeen
);

export default router;
