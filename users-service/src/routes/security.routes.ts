// src/routes/security.routes.ts
import express from 'express';
import { protect } from '../middleware/auth';
import {
    changePassword,
    getActiveSessions,
    logoutDevice,
    logoutAllDevices,
} from '../controllers/security.controller';

const router = express.Router();

// All routes require authentication
router.use(protect);

router.post('/change-password', changePassword);
router.get('/sessions', getActiveSessions);
router.delete('/sessions/:deviceId', logoutDevice);
router.delete('/sessions', logoutAllDevices);

export default router;
