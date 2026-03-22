import Redis from 'ioredis';

const ARTICLE_CACHE_TTL = 60; // 60 seconds as required

let redis: Redis | null = null;

function getRedis(): Redis | null {
    if (!redis) {
        try {
            redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
                maxRetriesPerRequest: 3,
                lazyConnect: true,
            });
            redis.on('error', (err) => {
                console.warn('[ArticleCache] Redis error:', err.message);
            });
        } catch {
            console.warn('[ArticleCache] Redis unavailable, serving uncached');
            return null;
        }
    }
    return redis;
}

/**
 * Build a deterministic cache key for article queries.
 */
function buildCacheKey(params: Record<string, any>): string {
    const sorted = Object.keys(params)
        .sort()
        .map((k) => `${k}=${params[k] ?? ''}`)
        .join('&');
    return `articles:${sorted}`;
}

/**
 * Article Cache Service — TTL 60 seconds.
 * Mirrors search-service cacheService pattern but with shorter TTL.
 */
export const articleCache = {
    /**
     * Get cached response. Returns null on miss or Redis unavailability.
     */
    get: async <T>(params: Record<string, any>): Promise<T | null> => {
        try {
            const client = getRedis();
            if (!client) return null;

            const key = buildCacheKey(params);
            const data = await client.get(key);
            if (!data) return null;

            return JSON.parse(data) as T;
        } catch {
            return null;
        }
    },

    /**
     * Set cached response with 60s TTL.
     */
    set: async (params: Record<string, any>, value: any): Promise<void> => {
        try {
            const client = getRedis();
            if (!client) return;

            const key = buildCacheKey(params);
            await client.set(key, JSON.stringify(value), 'EX', ARTICLE_CACHE_TTL);
        } catch (error) {
            console.warn('[ArticleCache] Set error:', error);
        }
    },

    /**
     * Invalidate cache entries matching a pattern (e.g., on article update).
     */
    invalidate: async (pattern: string = 'articles:*'): Promise<void> => {
        try {
            const client = getRedis();
            if (!client) return;

            const keys = await client.keys(pattern);
            if (keys.length > 0) {
                await client.del(...keys);
            }
        } catch (error) {
            console.warn('[ArticleCache] Invalidate error:', error);
        }
    },
};
