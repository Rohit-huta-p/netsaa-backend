import { Request, Response } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth';
import { generatePresignedUrl, PresignError } from '../services/presign.service';
import { PermissionError } from '../services/permission.service';

// ============================================================
// REQUEST VALIDATION SCHEMA
// ============================================================

/**
 * ARCHITECTURAL DECISION (LOCKED - DO NOT CHANGE):
 * 
 * Client-provided filenames are NEVER used in S3 key generation.
 * All S3 object keys are generated server-side using:
 *   - entityType (e.g., 'user', 'gig')
 *   - entityId (MongoDB ObjectId)
 *   - purpose (e.g., 'avatar', 'portfolio')
 *   - UUID (server-generated)
 *   - MIME-derived extension
 * 
 * This prevents:
 *   - Path traversal attacks
 *   - Filename collisions
 *   - PII leakage in storage paths
 *   - Inconsistent naming conventions
 * 
 * If you need to change this, a full migration is required.
 * Contact the architecture team before any modifications.
 */
const PresignRequestSchema = z.object({
    entityType: z.enum(['user', 'artist', 'gig', 'event', 'contract'], {
        errorMap: () => ({ message: 'entityType must be one of: user, artist, gig, event, contract' }),
    }),
    entityId: z.string().min(1, 'entityId is required').max(50),
    purpose: z.enum(['avatar', 'portfolio', 'audition', 'banner', 'gallery', 'thumbnail', 'promo', 'documents'], {
        errorMap: () => ({ message: 'purpose must be one of: avatar, portfolio, audition, banner, gallery, thumbnail, promo, documents' }),
    }),
    mimeType: z.string().min(1, 'mimeType is required').max(100),
    fileSize: z.number().positive('fileSize must be a positive number'),
});

type PresignRequestBody = z.infer<typeof PresignRequestSchema>;

// ============================================================
// CONTROLLER
// ============================================================

/**
 * POST /v1/media/presign
 * 
 * Generates a pre-signed S3 URL for file upload.
 * 
 * Request Body:
 * - entityType: 'user' | 'artist' | 'gig' | 'event' | 'contract'
 * - entityId: string (MongoDB ObjectId)
 * - purpose: 'avatar' | 'portfolio' | 'audition' | 'banner' | 'gallery' | 'thumbnail' | 'promo' | 'documents'
 * - mimeType: string (e.g., 'image/jpeg')
 * - fileSize: number (bytes)
 * 
 * Response:
 * - uploadUrl: Pre-signed PUT URL
 * - fileUrl: CDN-friendly public URL (after upload)
 * - key: S3 object key
 * - expiresIn: URL expiry in seconds
 */
export async function presignController(req: AuthRequest, res: Response): Promise<void> {
    try {
        // 1. Ensure user is authenticated
        if (!req.user) {
            res.status(401).json({
                error: 'UNAUTHORIZED',
                message: 'Authentication required',
            });
            return;
        }

        // 2. Validate request body
        const parseResult = PresignRequestSchema.safeParse(req.body);

        if (!parseResult.success) {
            const errors = parseResult.error.errors.map(err => ({
                field: err.path.join('.'),
                message: err.message,
            }));

            res.status(400).json({
                error: 'VALIDATION_ERROR',
                message: 'Invalid request body',
                details: errors,
            });
            return;
        }

        const body: PresignRequestBody = parseResult.data;

        // 3. Call presign service
        const result = await generatePresignedUrl(req.user, {
            entityType: body.entityType,
            entityId: body.entityId,
            purpose: body.purpose,
            mimeType: body.mimeType,
            fileSize: body.fileSize,
        });

        // 4. Return success response
        res.status(200).json({
            success: true,
            data: result,
        });

    } catch (error) {
        // Handle known error types
        if (error instanceof PermissionError) {
            res.status(error.statusCode).json({
                error: error.code,
                message: error.message,
            });
            return;
        }

        if (error instanceof PresignError) {
            res.status(error.statusCode).json({
                error: error.code,
                message: error.message,
            });
            return;
        }

        // Log unexpected errors
        console.error('[PresignController] Unexpected error:', error);

        res.status(500).json({
            error: 'INTERNAL_ERROR',
            message: 'An unexpected error occurred',
        });
    }
}
