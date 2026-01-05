import mongoose from 'mongoose';
import { SEARCH_CONFIG } from '../../config';
import { buildPeopleFilters } from './people.filters';
import { mapPersonToSearchResult } from './people.mapper';
import { atlasClient } from '../../infra/search/atlas.client';
import { buildPeoplePipeline } from '../../infra/search/pipelines/people.pipeline';
import { enrichPeopleResults } from '../enrichment/enrich.people';

import { generateSearchKey } from '../../cache/cache.keys';
import { cacheService } from '../../cache/cache.service';
import { assertPeopleSearchPipeline } from '../../config/assert-search-contract';

/**
 * Executes a search against the 'users' collection using Atlas Search.
 */
export const searchPeopleInDb = async (
    query: string,
    filters: Record<string, any>,
    page: number = 1,
    pageSize: number = SEARCH_CONFIG.DEFAULT_PAGE_SIZE,
    currentUserId?: string
) => {
    // 0. Check Cache (Include currentUserId in key to cache personalized exclusion)
    const cacheKey = generateSearchKey('people', query, { ...filters, excludedUser: currentUserId }, page, pageSize);
    const cached = await cacheService.get<{ results: any[]; total: number }>(cacheKey);
    if (cached) {
        return cached;
    }

    const skip = (page - 1) * pageSize;
    const { must, should, filter, mustNot: baseMustNot } = buildPeopleFilters(filters);

    // Initialize mustNot with baseMustNot or empty array
    const mustNot = baseMustNot || [];

    // Add exclusion for current user if ID is provided
    if (currentUserId) {
        try {
            // Ensure ID is valid ObjectId
            const userObjectId = new mongoose.Types.ObjectId(currentUserId);
            mustNot.push({
                equals: {
                    path: '_id',
                    value: userObjectId
                }
            });
        } catch (e) {
            // If invalid ID passed, ignore exclusion to prevent crash
            console.warn(`Invalid currentUserId passed to search: ${currentUserId}`);
        }
    }

    // 1. Build Pipeline (ID + Score only)
    const pipeline = buildPeoplePipeline({
        query,
        filters,
        limit: pageSize,
        skip,
    });

    assertPeopleSearchPipeline(pipeline);


    // 2. Execute Search via Infra Layer
    const { results, total } = await atlasClient.executeSearch('users', pipeline);
    console.log(`[people.search] executeSearch returned ${results.length} results. Total: ${total}`);

    if (results.length === 0) {
        return { results: [], total };
    }

    // 3. Enrichment: Fetch full documents by ID via Enrichment Layer
    const ids = results.map((r) => r._id);
    const docs = await enrichPeopleResults(ids);
    console.log(`[people.search] enrichPeopleResults returned ${docs.length} docs`);

    // 4. Merge & Preserve Order
    // Enrichment layer already endeavors to preserve order, but let's be safe or just map directly if it returns in order.
    // Our simple implementation likely returns filtered list not necessarily in order if we just used $in without aggregation sort.
    // Let's re-map using map for strict O(1) lookups per item.

    const docMap = new Map((docs as any[]).map((d) => [d._id.toString(), d]));

    const enrichedResults = results
        .map((r) => {
            const doc = docMap.get(r._id.toString());
            if (!doc) {
                console.warn(`[people.search] Doc not found for ID: ${r._id}`);
                return null;
            }
            return { ...doc, score: r.score };
        })
        .filter(Boolean)
        .map(mapPersonToSearchResult);

    console.log(`[people.search] enrichedResults count: ${enrichedResults.length}`);

    const response = {
        results: enrichedResults,
        total,
    };

    // 5. Set Cache (Async)
    await cacheService.set(cacheKey, response);

    return response;
};
