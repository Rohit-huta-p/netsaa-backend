import { Request, Response } from 'express';
import {
    listPendingTags,
    listSuggestionTags,
    approveTag,
    blockTag,
} from '../services/tagGovernance.service';

export async function getPendingTags(req: Request, res: Response) {
    const tags = await listPendingTags(100);
    res.json({ data: { tags, count: tags.length } });
}

export async function getSuggestionTags(req: Request, res: Response) {
    const limit = parseInt((req.query.limit as string) || '20', 10);
    const tags = await listSuggestionTags(Math.min(limit, 50));
    res.json({ data: { tags, count: tags.length } });
}

export async function postApproveTag(req: Request, res: Response) {
    const { tagId } = req.params;
    const adminId = (req as any).user?.id;
    if (!adminId) return res.status(401).json({ message: 'Unauthorized' });

    await approveTag(tagId, adminId);
    res.json({ message: 'approved' });
}

export async function postBlockTag(req: Request, res: Response) {
    const { tagId } = req.params;
    const adminId = (req as any).user?.id;
    if (!adminId) return res.status(401).json({ message: 'Unauthorized' });

    await blockTag(tagId, adminId);
    res.json({ message: 'blocked' });
}
