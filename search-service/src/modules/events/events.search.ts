import mongoose from 'mongoose';
import { SEARCH_CONFIG } from '../../config';
import { buildEventsFilters } from './events.filters';
import { mapEventToSearchResult } from './events.mapper';
import { atlasClient } from '../../infra/search/atlas.client';
import { buildEventsPipeline } from '../../infra/search/pipelines/events.pipeline';
import { enrichEventsResults } from '../enrichment/enrich.events';

import { generateSearchKey } from '../../cache/cache.keys';
import { cacheService } from '../../cache/cache.service';

/**
 * Executes a search against the 'events' collection using Atlas Search.
 */
export const searchEventsInDb = async (
    query: string,
    filters: Record<string, any>,
    page: number = 1,
    pageSize: number = SEARCH_CONFIG.DEFAULT_PAGE_SIZE
) => {
    const cacheKey = generateSearchKey('events', query, filters, page, pageSize);
    const cached = await cacheService.get<{ results: any[]; total: number }>(cacheKey);
    if (cached) return cached;

    const skip = (page - 1) * pageSize;
    const { must, should, filter } = buildEventsFilters(filters);

    const pipeline = buildEventsPipeline(query, must, should, filter, skip, pageSize);

    const { results, total } = await atlasClient.executeSearch('events', pipeline);

    if (results.length === 0) {
        return { results: [], total };
    }

    // Enrichment
    const ids = results.map((r) => r._id);
    const docs = await enrichEventsResults(ids);

    const docMap = new Map((docs as any[]).map((d) => [d._id.toString(), d]));

    const enrichedResults = results
        .map((r) => {
            const doc = docMap.get(r._id);
            if (!doc) return null;
            return { ...doc, score: r.score };
        })
        .filter(Boolean)
        .map(mapEventToSearchResult);

    const response = {
        results: enrichedResults,
        total,
    };

    await cacheService.set(cacheKey, response);
    return response;
};
