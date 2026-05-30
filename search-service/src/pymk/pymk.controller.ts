import { Request, Response } from 'express';
import { pymkService } from './pymk.service';
import { dismissArtist } from './pymk.dismiss';
import { emitPymkMetric } from '../analytics/metrics';

const MAX_PAGE_SIZE = 50;
const DEFAULT_PAGE_SIZE = 10;

export const pymkController = {
  async getPymk(req: Request, res: Response) {
    const viewerId = (req as any).user?.id || (req.query.viewerId as string | undefined);
    if (!viewerId) return res.status(401).json({ error: 'viewerId required' });

    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const requestedPageSize = parseInt(req.query.pageSize as string) || DEFAULT_PAGE_SIZE;
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, requestedPageSize));

    const start = Date.now();
    const result = await pymkService.read(viewerId, page, pageSize);
    const latencyMs = Date.now() - start;
    emitPymkMetric({
      viewerId,
      latencyMs,
      strategy: result.strategy,
      total: result.total,
      page,
      fallback: result.computedAt === null,
    });
    return res.json(result);
  },

  async postDismiss(req: Request, res: Response) {
    const viewerId = (req as any).user?.id || req.body.viewerId;
    const artistId = req.body.artistId;
    if (!viewerId || !artistId) {
      return res.status(400).json({ error: 'viewerId + artistId required' });
    }
    await dismissArtist(viewerId, artistId);
    return res.status(204).send();
  },
};
