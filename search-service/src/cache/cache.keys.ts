import { createMd5Hash, stableStringify } from '../utils/hash.util';

/**
 * Cache TTL values in seconds
 */
export const CACHE_TTL = {
    SEARCH_RESULTS: 60, // 60 seconds for search results
    ENRICHMENT: 300,    // 5 minutes for enriched data
};

/**
 * Generates a stable deterministic cache key for search queries.
 *
 * Cache key format: search:{index}:{hash}
 * Hash includes: query + normalizedFilters + page + pageSize
 *
 * Example: search:gigs:a1b2c3d4e5f6...
 *
 * @param index - The search index (gigs, people, events)
 * @param query - The search query string
 * @param filters - Normalized filters object (stringified)
 * @param page - Current page number
 * @param pageSize - Number of results per page
 * @returns Deterministic cache key string
 */
export const generateSearchKey = (
    index: string,
    query: string,
    filters: Record<string, any>,
    page: number,
    pageSize: number
): string => {
    try {
        // Normalize query (trim and lowercase for consistency)
        const normalizedQuery = (query || '').trim().toLowerCase();

        // Stable stringify filters (handles nested objects, sorts keys)
        const filtersString = stableStringify(filters || {});

        // Build payload: query + filters + page + pageSize
        const payload = JSON.stringify({
            q: normalizedQuery,
            f: filtersString,
            p: page,
            ps: pageSize,
        });

        // Generate MD5 hash of payload
        const hash = createMd5Hash(payload);

        return `search:${index}:${hash}`;
    } catch (error) {
        // Cache key generation failure should not break search
        // Return a unique key that won't match cached results
        console.warn('Cache key generation failed, using fallback:', error);
        return `search:${index}:fallback:${Date.now()}:${Math.random().toString(36).slice(2)}`;
    }
};

/**
 * Generates a cache key for enriched results.
 *
 * @param index - The search index
 * @param ids - Array of document IDs
 * @returns Cache key for enrichment data
 */
export const generateEnrichmentKey = (index: string, ids: string[]): string => {
    try {
        const sortedIds = [...ids].sort();
        const hash = createMd5Hash(sortedIds.join(','));
        return `enrich:${index}:${hash}`;
    } catch (error) {
        console.warn('Enrichment cache key generation failed:', error);
        return `enrich:${index}:fallback:${Date.now()}`;
    }
};

/**
 * Generates a cache key for autocomplete suggestions.
 *
 * @param index - The search index
 * @param prefix - The autocomplete prefix
 * @returns Cache key for autocomplete
 */
export const generateAutocompleteKey = (index: string, prefix: string): string => {
    try {
        const normalizedPrefix = (prefix || '').trim().toLowerCase();
        const hash = createMd5Hash(normalizedPrefix);
        return `autocomplete:${index}:${hash}`;
    } catch (error) {
        console.warn('Autocomplete cache key generation failed:', error);
        return `autocomplete:${index}:fallback:${Date.now()}`;
    }
};
