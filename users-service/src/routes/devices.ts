import express from 'express';
import {
    registerDevice,
    listMyDevices,
    unregisterDevice,
} from '../controllers/devices.controller';
import { protect } from '../middleware/auth';

const router = express.Router();

// All device endpoints require auth — devices belong to a logged-in user.
router.use(protect);

router.post('/', registerDevice);
router.get('/', listMyDevices);
router.delete('/:deviceId', unregisterDevice);

export default router;
