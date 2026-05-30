import { Request, Response } from 'express';
import { similarService } from './similar.service';

const DEFAULT_RAIL_LIMIT = 6;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;
const MAX_RAIL_LIMIT = 20;

export const similarController = {
  async getSimilar(req: Request, res: Response) {
    const artistId = req.params.id;
    const page = req.query.page !== undefined ? parseInt(req.query.page as string) : undefined;
    const pageSizeRaw = req.query.pageSize !== undefined ? parseInt(req.query.pageSize as string) : undefined;
    const limitRaw = req.query.limit !== undefined ? parseInt(req.query.limit as string) : undefined;

    let opts: { limit: number } | { page: number; pageSize: number };
    if (page !== undefined && !Number.isNaN(page)) {
      const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, pageSizeRaw ?? DEFAULT_PAGE_SIZE));
      opts = { page: Math.max(1, page), pageSize };
    } else {
      const limit = Math.min(MAX_RAIL_LIMIT, Math.max(1, limitRaw ?? DEFAULT_RAIL_LIMIT));
      opts = { limit };
    }

    const result = await similarService.read(artistId, opts);
    return res.json(result);
  },
};
