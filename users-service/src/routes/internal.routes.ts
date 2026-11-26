import express from 'express';
import { requireServiceToken } from '../middleware/serviceAuth';
import { attachMedia } from '../controllers/internalMedia';
import { notifyFolloweePosted, enqueueEvent, notifyEventAnnouncement } from '../controllers/internalNotifications';

const router = express.Router();

router.post('/users/media/attach', requireServiceToken, attachMedia);

// Cross-service fan-out: a followed organizer published a gig/event → notify
// their followers. Called by gigs-service / events-service on first publish.
router.post('/notifications/followee-posted', requireServiceToken, notifyFolloweePosted);

// Generic notification enqueue: called by any backend service that cannot import
// the BullMQ queue directly (gigs-service, events-service, etc.).
router.post('/notifications/enqueue', requireServiceToken, enqueueEvent);

// Event-announcement fan-out: a host broadcast a message to their attendees.
// events-service resolves the audience and posts the recipient ids here.
router.post('/notifications/event-announcement', requireServiceToken, notifyEventAnnouncement);

export default router;
