import { Request, Response, NextFunction } from 'express';
import { searchService } from './search.service';
import { searchPreviewService } from './search.preview.service';
import { SEARCH_CONFIG } from '../../config';

export class SearchController {

    /**
     * GET /search/preview?q=...
     * Unified search preview (LinkedIn style).
     */
    async previewSearch(req: Request, res: Response, next: NextFunction) {
        try {
            const q = (req.query.q as string) || '';

            const results = await searchPreviewService.executePreview(q);

            return res.json(results);
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /search/people?q=...&page=1
     */
    async searchPeople(req: Request, res: Response, next: NextFunction) {
        try {
            const q = (req.query.q as string) || '';
            const page = parseInt(req.query.page as string || '1', 10);
            const filters = req.query; // Expand this later to extract specific filters

            // Extract User ID from header (gateway/auth service usually passes this)
            // or req.user if middleware populated it.
            // Supporting both for flexibility.
            const reqAny = req as any;
            const userId = reqAny.user?._id || reqAny.user?.id || req.headers['x-user-id'] as string;

            const results = await searchService.searchPeople(q, filters, page, userId);
            return res.json(results);
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /search/gigs?q=...&page=1
     */
    async searchGigs(req: Request, res: Response, next: NextFunction) {
        try {
            const q = (req.query.q as string) || '';
            const page = parseInt(req.query.page as string || '1', 10);
            const filters = req.query;

            const results = await searchService.searchGigs(q, filters, page);
            return res.json(results);
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /search/events?q=...&page=1
     */
    async searchEvents(req: Request, res: Response, next: NextFunction) {
        try {
            const q = (req.query.q as string) || '';
            const page = parseInt(req.query.page as string || '1', 10);
            const filters = req.query;

            const results = await searchService.searchEvents(q, filters, page);
            return res.json(results);
        } catch (error) {
            next(error);
        }
    }
}

export const searchController = new SearchController();
