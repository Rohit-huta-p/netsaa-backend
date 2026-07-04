import { Router } from 'express';
import { requireServiceToken } from '../middleware/serviceAuth';
import { attachMedia } from '../controllers/internalMedia';

const router = Router();
router.post('/events/media/attach', requireServiceToken, attachMedia);
export default router;
