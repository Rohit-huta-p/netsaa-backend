import { createMd5Hash, stableStringify } from '../utils/hash.util';

/**
 * Generates a stable deterministic cache key for search queries.
 */
export const generateSearchKey = (
    index: string,
    query: string,
    filters: Record<string, any>,
    page: number,
    pageSize: number
): string => {
    // Use shared stable stringify
    const filtersString = stableStringify(filters);

    const payload = `${index}:${query}:${filtersString}:${page}:${pageSize}`;

    // Use shared hash function
    const hash = createMd5Hash(payload);

    return `search:${index}:${hash}`;
};
