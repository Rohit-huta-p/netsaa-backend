import express from 'express';
import { protect } from '../middleware/auth';
import { switchRole } from '../controllers/role.controller';

const router = express.Router();

// All routes require authentication
router.use(protect);

router.post('/role', switchRole);

export default router;
