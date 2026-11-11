import { Router } from 'express';
import { requireServiceToken } from '../middleware/serviceAuth';
import { checkGigDiscussionAccess } from '../controllers/internalDiscussion';

const router = Router();

router.get('/discussion/gig/:gigId', requireServiceToken, checkGigDiscussionAccess);

export default router;
