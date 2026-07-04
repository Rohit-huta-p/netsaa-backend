import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { presignController } from '../controllers/media.presign.controller';
import { videoUploadController, assetStatusController } from '../controllers/media.video.controller';
import { muxWebhookController } from '../controllers/media.webhook.controller';

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

/**
 * POST /v1/media/video/upload
 *
 * Create a Mux direct upload for a video (event gallery only, Phase 1).
 * Requires authentication.
 */
router.post('/video/upload', requireAuth, videoUploadController);

/**
 * GET /v1/media/asset/:uploadId
 *
 * Fetch the current processing status of a video upload/asset.
 * Owner-scoped. Requires authentication.
 */
router.get('/asset/:uploadId', requireAuth, assetStatusController);

/**
 * POST /v1/media/webhooks/mux
 *
 * Mux webhook receiver. No requireAuth — authenticity is verified via the
 * Mux signature (raw body, see server.ts). Must stay unauthenticated so Mux
 * itself can call it.
 */
router.post('/webhooks/mux', muxWebhookController);

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
