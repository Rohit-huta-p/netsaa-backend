import { getRedisClient } from '../config/redis';

/**
 * Safe wrapper around Redis client.
 * Fails gracefully (returns undefined) if Redis is not connected.
 */
export const cacheClient = {
    get: async (key: string): Promise<string | null | undefined> => {
        try {
            const redis = getRedisClient();
            if (!redis) return undefined;
            return await redis.get(key);
        } catch (error) {
            console.warn(`[Cache] Get error for key ${key}:`, error);
            return undefined;
        }
    },

    set: async (key: string, value: string, ttlSeconds?: number): Promise<void> => {
        try {
            const redis = getRedisClient();
            if (!redis) return;

            if (ttlSeconds) {
                await redis.set(key, value, 'EX', ttlSeconds);
            } else {
                await redis.set(key, value);
            }
        } catch (error) {
            console.warn(`[Cache] Set error for key ${key}:`, error);
        }
    },
};
