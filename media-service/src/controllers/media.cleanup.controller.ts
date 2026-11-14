import { Request, Response } from 'express';
import { cleanupMedia, CleanupInput, CleanupVideoRef } from '../services/cleanup.service';

/**
 * POST /v1/media/internal/cleanup   (internal-service auth)
 *
 * Body: { images?: string[], videos?: Array<{ uploadId?, playbackId? }> }
 * Deletes the removed/replaced media from S3 (images) and Mux (videos).
 * Idempotent + best-effort — always 200 with a per-category summary unless the
 * request itself is malformed.
 */
export async function cleanupController(req: Request, res: Response): Promise<void> {
    const body = (req.body ?? {}) as CleanupInput;

    const images = Array.isArray(body.images)
        ? body.images.filter((x): x is string => typeof x === 'string' && x.length > 0)
        : [];
    const videos = Array.isArray(body.videos)
        ? body.videos.filter(
            (v): v is CleanupVideoRef =>
                !!v && (typeof v.uploadId === 'string' || typeof v.playbackId === 'string'),
        )
        : [];

    if (!images.length && !videos.length) {
        res.status(200).json({
            ok: true,
            imagesDeleted: 0,
            imagesSkipped: 0,
            videosDeleted: 0,
            videosSkipped: 0,
            errors: [],
        });
        return;
    }

    try {
        const result = await cleanupMedia({ images, videos });
        res.status(200).json({ ok: true, ...result });
    } catch (e: any) {
        res.status(500).json({ ok: false, error: 'CLEANUP_FAILED', message: e?.message ?? 'cleanup failed' });
    }
}
