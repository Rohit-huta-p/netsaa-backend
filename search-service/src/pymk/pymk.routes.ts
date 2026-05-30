import { Router } from 'express';
import { pymkController } from './pymk.controller';

const router = Router();
router.get('/pymk', pymkController.getPymk);
router.post('/dismiss', pymkController.postDismiss);
export default router;
