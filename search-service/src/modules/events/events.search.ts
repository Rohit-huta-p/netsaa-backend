import mongoose from 'mongoose';
import { SEARCH_CONFIG } from '../../config';
import { normalizeEventFilters } from '../search/dto/event-search-filter';

import { mapEventToSearchResult } from './events.mapper';
import { atlasClient } from '../../infra/search/atlas.client';
import { buildEventsPipeline } from '../../infra/search/pipelines/events.pipeline';
import { enrichEventsResults } from '../enrichment/enrich.events';

import { generateSearchKey } from '../../cache/cache.keys';
import { cacheService } from '../../cache/cache.service';
import { buildEventsRankingClauses, buildEventsSortStage } from '../../ranking/events.rank';

/**
 * Executes a search against the 'events' collection using Atlas Search.
 */
export const searchEventsInDb = async (
    query: string,
    rawFilters: Record<string, any>,
    page: number = 1,
    pageSize: number = SEARCH_CONFIG.DEFAULT_PAGE_SIZE
) => {
    // --- 1. Normalize filters ---
    const { hardFilters, boostSignals, sortMode } = normalizeEventFilters(rawFilters);

    // --- 2. Cache Key ---
    // Use normalized filters for cache key to ensure consistency and avoid duplicate cache entries
    const normalizedForCache = { ...hardFilters, ...boostSignals, sortMode };
    const cacheKey = generateSearchKey('events', query, normalizedForCache, page, pageSize);
    // const cached = await cacheService.get<{ results: any[]; total: number }>(cacheKey);
    // if (cached) {
    //     console.log("cached results", cached);
    //     return cached
    // };

    // --- 3. Build Text Search (must) ---
    const must: any[] = [];
    if (query && query.trim()) {
        must.push({
            text: {
                query: query.trim(),
                path: ['title', 'description', 'category', 'location.city', 'location.venueName'],
                fuzzy: { maxEdits: 1 },
                score: { boost: { value: 3 } } // Text Relevance * 3
            },
        });
    }

    // --- 4. Build Ranking Clauses (should) ---
    const rankingClauses = buildEventsRankingClauses(boostSignals);

    const skip = (page - 1) * pageSize;

    // --- 5. Build Base Pipeline ---
    const pipeline = buildEventsPipeline(
        query,
        must,
        rankingClauses, // Pass dynamic ranking clauses here
        hardFilters,
        skip,
        pageSize
    );

    console.log('[searchEventsInDb] Raw Filters:', JSON.stringify(rawFilters));
    console.log('[searchEventsInDb] Normalized Filters:', JSON.stringify(hardFilters));
    console.log('[searchEventsInDb] Pipeline:', JSON.stringify(pipeline, null, 2)); // Detailed pipeline log

    // --- 6. Apply Sorting ---
    // If sortMode is NOT relevance, inject sort stage
    const sortStage = buildEventsSortStage(sortMode);
    if (sortStage) {
        // Insert before $facet stage
        // pipeline is [searchStage, addFieldsScore, project, facet]
        // We usually insert sort after search, before projection or facet.
        // If sorting by non-score field, we might lose score relevance sort, which is intended override.

        const facetIndex = pipeline.findIndex((stage) => '$facet' in stage);
        if (facetIndex > 0) {
            pipeline.splice(facetIndex, 0, sortStage);
        }
    }

    const { results, total } = await atlasClient.executeSearch('events', pipeline);

    if (results.length === 0) {
        return { results: [], total };
    }

    // Enrichment
    const ids = results.map((r) => r._id);
    const docs = await enrichEventsResults(ids);
    console.log("[enrichedResults] doc", docs);
    const docMap = new Map((docs as any[]).map((d) => [d._id.toString(), d]));

    const enrichedResults = results
        .map((r) => {
            const doc = docMap.get(r._id.toString());
            if (!doc) return null;
            // Debug log for status issue
            console.log(`[Debug] Found Event: ${doc._id} | Status: '${doc.status}' | Category: '${doc.category}'`);
            return { ...doc, score: r.score };
        })
        .filter(Boolean)
        .map(mapEventToSearchResult);

    const response = {
        results: enrichedResults,
        total,
    };

    // await cacheService.set(cacheKey, response);
    return response;
};
