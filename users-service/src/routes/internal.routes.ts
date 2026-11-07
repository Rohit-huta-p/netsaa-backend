import express from 'express';
import { requireServiceToken } from '../middleware/serviceAuth';
import { attachMedia } from '../controllers/internalMedia';

const router = express.Router();

router.post('/users/media/attach', requireServiceToken, attachMedia);

export default router;
