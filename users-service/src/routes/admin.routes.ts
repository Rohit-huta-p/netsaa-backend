import express from 'express';
import path from 'path';
import { adminAuth } from '../middleware/adminAuth';
import { listUsers, listGigs, deleteUser, deleteGig } from '../controllers/admin.controller';

const router = express.Router();

router.get('/page', (_req, res) => {
  res.sendFile(path.resolve(__dirname, '../../public/admin.html'));
});

router.use(adminAuth);
router.get('/users', listUsers);
router.get('/gigs', listGigs);
router.delete('/users/:id', deleteUser);
router.delete('/gigs/:id', deleteGig);

export default router;
