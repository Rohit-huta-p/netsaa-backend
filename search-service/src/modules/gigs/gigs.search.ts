import mongoose from 'mongoose';
import { SEARCH_CONFIG } from '../../config';
import { buildGigsFilters } from './gigs.filters';
import { mapGigToSearchResult } from './gigs.mapper';
import { atlasClient } from '../../infra/search/atlas.client';
import { buildGigsPipeline } from '../../infra/search/pipelines/gigs.pipeline';
import { enrichGigsResults } from '../enrichment/enrich.gigs';

import { generateSearchKey } from '../../cache/cache.keys';
import { cacheService } from '../../cache/cache.service';

/**
 * Executes a search against the 'gigs' collection using Atlas Search.
 */
export const searchGigsInDb = async (
    query: string,
    filters: Record<string, any>,
    page: number = 1,
    pageSize: number = SEARCH_CONFIG.DEFAULT_PAGE_SIZE
) => {
    const cacheKey = generateSearchKey('gigs', query, filters, page, pageSize);
    const cached = await cacheService.get<{ results: any[]; total: number }>(cacheKey);
    if (cached) return cached;

    const skip = (page - 1) * pageSize;
    const { must, should, filter } = buildGigsFilters(filters);

    const pipeline = buildGigsPipeline(query, must, should, filter, skip, pageSize);

    const { results, total } = await atlasClient.executeSearch('gigs', pipeline);

    if (results.length === 0) {
        return { results: [], total };
    }

    // Enrichment
    const ids = results.map((r) => r._id);
    const docs = await enrichGigsResults(ids);

    const docMap = new Map((docs as any[]).map((d) => [d._id.toString(), d]));

    const enrichedResults = results
        .map((r) => {
            const doc = docMap.get(r._id);
            if (!doc) return null;
            return { ...doc, score: r.score };
        })
        .filter(Boolean)
        .map(mapGigToSearchResult);

    const response = {
        results: enrichedResults,
        total,
    };

    await cacheService.set(cacheKey, response);
    return response;
};
