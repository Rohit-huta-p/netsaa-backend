// src/routes/danger.routes.ts
import express from 'express';
import { protect } from '../middleware/auth';
import { deactivateAccount, deleteAccount, restoreAccount } from '../controllers/danger.controller';

const router = express.Router();

// All routes require authentication
router.use(protect);

router.post('/deactivate', deactivateAccount);
router.post('/delete', deleteAccount);
router.post('/restore', restoreAccount);

export default router;
