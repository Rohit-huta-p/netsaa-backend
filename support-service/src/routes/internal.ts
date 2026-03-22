import express from 'express';
import { protect, requireAdmin } from '../middleware/auth';
import { getSLABreached, getSupportStats } from '../controllers/ticketController';

const router = express.Router();

// ─── Admin / Internal Routes ───
router.route('/sla/breached')
    .get(protect, requireAdmin, getSLABreached);

router.route('/stats')
    .get(protect, requireAdmin, getSupportStats);

export default router;
