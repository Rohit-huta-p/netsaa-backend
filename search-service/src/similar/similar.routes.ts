import { Router } from 'express';
import { similarController } from './similar.controller';

const router = Router();
router.get('/similar/:id', similarController.getSimilar);
export default router;
