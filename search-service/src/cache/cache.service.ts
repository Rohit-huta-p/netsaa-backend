import { cacheClient } from './cache.client';

export const CACHE_TTL = {
    SEARCH_RESULTS: 60 * 5, // 5 minutes
};

/**
 * Generic Cache Service
 */
export const cacheService = {
    get: async <T>(key: string): Promise<T | null> => {
        // TEMPORARILY DISABLED
        return null;
        /*
        const data = await cacheClient.get(key);
        if (!data) return null;
        try {
            return JSON.parse(data) as T;
        } catch (e) {
            return null;
        }
        */
    },

    set: async (key: string, value: any, ttlSeconds: number = CACHE_TTL.SEARCH_RESULTS): Promise<void> => {
        // TEMPORARILY DISABLED
        return;
        /*
        const stringValue = JSON.stringify(value);
        await cacheClient.set(key, stringValue, ttlSeconds);
        */
    },
};
