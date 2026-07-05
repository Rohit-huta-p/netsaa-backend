import { Response } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth';
import { createVideoUpload, getAssetStatus } from '../services/video.service';
import { PermissionError } from '../services/permission.service';

const Body = z.object({
  entityType: z.enum(['event', 'user']),
  entityId: z.string().min(1).max(50),
  purpose: z.enum(['gallery', 'portfolio']),
});

export async function videoUploadController(req: AuthRequest, res: Response): Promise<void> {
  if (!req.user) { res.status(401).json({ error: 'UNAUTHORIZED', message: 'Auth required' }); return; }
  const parsed = Body.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid body' }); return; }
  try {
    const data = await createVideoUpload(req.user, parsed.data);
    res.status(200).json({ success: true, data });
  } catch (err) {
    if (err instanceof PermissionError) { res.status(err.statusCode).json({ error: err.code, message: err.message }); return; }
    console.error('[videoUpload] error', err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Could not create upload' });
  }
}

export async function assetStatusController(req: AuthRequest, res: Response): Promise<void> {
  if (!req.user) { res.status(401).json({ error: 'UNAUTHORIZED', message: 'Auth required' }); return; }
  const status = await getAssetStatus(req.user, req.params.uploadId);
  if (!status) { res.status(404).json({ error: 'NOT_FOUND', message: 'Asset not found' }); return; }
  res.status(200).json({ success: true, data: status });
}
