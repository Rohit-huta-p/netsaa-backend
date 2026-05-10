import { Router } from 'express';
import { protect, adminOnly } from '../middleware/auth';
import {
    getPendingTags,
    getSuggestionTags,
    postApproveTag,
    postBlockTag,
} from '../controllers/admin.controller';

const router = Router();

// Public-ish: any authed user can read suggestion list (for composer autocomplete)
router.get('/tags/suggestions', protect, getSuggestionTags);

// Admin-only: tag moderation queue + actions
router.get('/tags/pending', protect, adminOnly, getPendingTags);
router.post('/tags/:tagId/approve', protect, adminOnly, postApproveTag);
router.post('/tags/:tagId/block', protect, adminOnly, postBlockTag);

export default router;
