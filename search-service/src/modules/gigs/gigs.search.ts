import { SEARCH_CONFIG } from '../../config';
import { normalizeGigFilters } from './gigs.filters';
import { mapGigToSearchResult } from './gigs.mapper';
import { atlasClient } from '../../infra/search/atlas.client';
import { buildGigsPipeline } from '../../infra/search/pipelines/gigs.pipeline';
import { enrichGigsResults } from '../enrichment/enrich.gigs';
import { buildGigsAllRankingClauses, buildGigsSortStage } from '../../ranking/gigs.rank';
import { GigSearchFilters } from '../search/dto/gig-search-filter.dto';

import { generateSearchKey } from '../../cache/cache.keys';
import { cacheService } from '../../cache/cache.service';

/**
 * Executes a search against the 'gigs' collection using Atlas Search.
 *
 * Flow:
 * 1. Receive raw filters from controller
 * 2. Call normalizeGigFilters to convert to GigSearchFilters
 * 3. Pass hardFilters to pipeline builder
 * 4. Pass boostSignals to ranking
 * 5. Execute Atlas Search
 * 6. Apply ranking/sorting
 * 7. Return paginated results
 *
 * Ensures:
 * - Empty filters do not affect query
 * - Invalid filters fail gracefully
 */
export const searchGigsInDb = async (
    query: string,
    rawFilters: Record<string, any> = {},
    page: number = 1,
    pageSize: number = SEARCH_CONFIG.DEFAULT_PAGE_SIZE
) => {
    try {
        // --- 1. Normalize raw filters ---
        let normalizedFilters: GigSearchFilters;
        try {
            normalizedFilters = normalizeGigFilters(rawFilters || {});
        } catch (error) {
            // Invalid filters fail gracefully - use empty filters
            console.warn('Failed to normalize gig filters, using defaults:', error);
            normalizedFilters = {
                hardFilters: {},
                boostSignals: {},
                sortMode: 'relevance',
            };
        }

        const { hardFilters, boostSignals, sortMode } = normalizedFilters;

        // --- 2. Generate cache key ---
        const cacheKey = generateSearchKey('gigs', query, rawFilters, page, pageSize);
        const cached = await cacheService.get<{ results: any[]; total: number }>(cacheKey);
        if (cached) return cached;

        // --- 3. Build ranking clauses ---
        const rankingClauses = buildGigsAllRankingClauses(query, boostSignals);

        // --- 4. Build must clauses (text search) ---
        const must: any[] = [];
        if (query && query.trim()) {
            must.push({
                text: {
                    query: query.trim(),
                    path: ['title', 'description', 'artistType', 'city'],
                    fuzzy: { maxEdits: 1 },
                },
            });
        }

        // --- 5. Build pagination ---
        const skip = (page - 1) * pageSize;

        // --- 6. Build pipeline with hardFilters ---
        const pipeline = buildGigsPipeline(
            query,
            must,
            rankingClauses, // Pass ranking as should clauses
            hardFilters,
            skip,
            pageSize
        );

        // --- 7. Add sort stage if needed (for newest/highestPay) ---
        const sortStage = buildGigsSortStage(sortMode);
        if (sortStage) {
            // Insert sort stage after $search but before $facet
            // Find the $facet index and insert before it
            const facetIndex = pipeline.findIndex((stage) => '$facet' in stage);
            if (facetIndex > 0) {
                pipeline.splice(facetIndex, 0, sortStage);
            }
        }

        // --- 8. Execute Atlas Search ---
        // DEBUG: Log the full pipeline
        console.log('[Gigs Pipeline] Full pipeline:', JSON.stringify(pipeline, null, 2));

        const { results, total } = await atlasClient.executeSearch('gigs', pipeline);

        if (results.length === 0) {
            return { results: [], total };
        }

        // --- 9. Enrichment ---
        const ids = results.map((r) => r._id);
        const docs = await enrichGigsResults(ids);

        const docMap = new Map((docs as any[]).map((d) => [d._id.toString(), d]));

        // DEBUG: Check ID types
        if (results.length > 0) {
            console.log(`[Mapping] Search Result ID type: ${typeof results[0]._id}, Value: ${results[0]._id}`);
            console.log(`[Mapping] Doc Map keys sample: ${Array.from(docMap.keys())[0]}`);
        }

        const enrichedResults = results
            .map((r) => {
                const doc = docMap.get(r._id.toString()); // Force string lookup
                if (!doc) {
                    console.warn(`[Mapping] Doc not found for ID: ${r._id}`);
                    return null;
                }
                return { ...doc, score: r.score };
            })
            .filter(Boolean)
            .map(mapGigToSearchResult);

        // --- 10. Cache and return ---
        const response = {
            results: enrichedResults,
            total,
        };

        await cacheService.set(cacheKey, response);
        return response;
    } catch (error) {
        console.error('Gigs search failed:', error);
        // Fail gracefully - return empty results
        return {
            results: [],
            total: 0,
            error: error instanceof Error ? error.message : 'Search failed',
        };
    }
};

/**
 * Convenience function to search gigs with pre-normalized filters.
 * Use this when filters have already been normalized.
 */
export const searchGigsWithFilters = async (
    query: string,
    filters: GigSearchFilters,
    page: number = 1,
    pageSize: number = SEARCH_CONFIG.DEFAULT_PAGE_SIZE
) => {
    const { hardFilters, boostSignals, sortMode } = filters;

    const cacheKey = generateSearchKey('gigs', query, filters, page, pageSize);
    const cached = await cacheService.get<{ results: any[]; total: number }>(cacheKey);
    if (cached) return cached;

    const rankingClauses = buildGigsAllRankingClauses(query, boostSignals);

    const must: any[] = [];
    if (query && query.trim()) {
        must.push({
            text: {
                query: query.trim(),
                path: ['title', 'description', 'artistType', 'city'],
                fuzzy: { maxEdits: 1 },
            },
        });
    }

    const skip = (page - 1) * pageSize;

    const pipeline = buildGigsPipeline(
        query,
        must,
        rankingClauses,
        hardFilters,
        skip,
        pageSize
    );

    const sortStage = buildGigsSortStage(sortMode);
    if (sortStage) {
        const facetIndex = pipeline.findIndex((stage) => '$facet' in stage);
        if (facetIndex > 0) {
            pipeline.splice(facetIndex, 0, sortStage);
        }
    }

    const { results, total } = await atlasClient.executeSearch('gigs', pipeline);

    if (results.length === 0) {
        return { results: [], total };
    }

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
