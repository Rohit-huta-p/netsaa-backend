import express from 'express';
import { requireServiceToken } from '../middleware/serviceAuth';
import { attachMedia } from '../controllers/internalMedia';
import { notifyFolloweePosted } from '../controllers/internalNotifications';

const router = express.Router();

router.post('/users/media/attach', requireServiceToken, attachMedia);

// Cross-service fan-out: a followed organizer published a gig/event → notify
// their followers. Called by gigs-service / events-service on first publish.
router.post('/notifications/followee-posted', requireServiceToken, notifyFolloweePosted);

export default router;
