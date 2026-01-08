import express from 'express';
import { protect } from '../middleware/auth';
import ConnectionsController from './connections.controller';

const router = express.Router();

router.post('/request', protect, ConnectionsController.sendConnectionRequest);
router.patch('/:connectionId/accept', protect, ConnectionsController.acceptConnection);
router.patch('/:connectionId/reject', protect, ConnectionsController.rejectConnection);
router.patch('/:connectionId/block', protect, ConnectionsController.blockConnection);
router.get('/requests/sent', protect, ConnectionsController.listSentRequests);
router.get('/requests', protect, ConnectionsController.listRequests);
router.get('/', protect, ConnectionsController.listConnections);

export default router;
