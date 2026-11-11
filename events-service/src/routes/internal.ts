import { Router } from 'express';
import { requireServiceToken } from '../middleware/serviceAuth';
import { attachMedia } from '../controllers/internalMedia';
import { checkEventDiscussionAccess } from '../controllers/internalDiscussion';

const router = Router();
router.post('/events/media/attach', requireServiceToken, attachMedia);
router.get('/discussion/event/:eventId', requireServiceToken, checkEventDiscussionAccess);
export default router;
