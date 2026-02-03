import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { presignController } from '../controllers/media.presign.controller';

const router = Router();

// ============================================================
// ROUTES
// ============================================================

/**
 * POST /v1/media/presign
 * 
 * Generate a pre-signed S3 URL for file upload.
 * Requires authentication.
 */
router.post('/presign', requireAuth, presignController);

// ============================================================
// HEALTH CHECK
// ============================================================

/**
 * GET /v1/media/health
 * 
 * Health check endpoint for load balancers.
 */
router.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', service: 'media-service' });
});

export default router;
