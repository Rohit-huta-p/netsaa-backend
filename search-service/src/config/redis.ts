import Redis from 'ioredis';
import { env } from './env';

let redisClient: Redis;

export const connectRedis = async () => {
    if (!env.REDIS_URL) {
        console.log('[search-service] Skipping Redis connection (REDIS_URL not set)');
        return;
    }

    redisClient = new Redis(env.REDIS_URL, {
        lazyConnect: true,
        retryStrategy: (times) => {
            // Exponential backoff with max 2s delay
            const delay = Math.min(times * 50, 2000);
            return delay;
        },
        maxRetriesPerRequest: 3,
    });

    redisClient.on('error', (err) => {
        console.error('[Redis] Error:', err);
    });

    redisClient.on('connect', () => {
        console.log('[search-service] Connected to Redis');
    });

    try {
        await redisClient.connect();
    } catch (error) {
        console.error('[search-service] Failed to connect to Redis:', error);
    }
};

export const disconnectRedis = async () => {
    if (redisClient) {
        try {
            if (['ready', 'connecting', 'reconnecting'].includes(redisClient.status)) {
                await redisClient.quit();
                console.log('[search-service] Disconnected from Redis');
            }
        } catch (error) {
            console.error('[search-service] Error disconnecting Redis:', error);
        }
    }
};

// Export singleton instance (getter to ensure initialized)
export const getRedisClient = () => {
    if (!redisClient && env.REDIS_URL) {
        throw new Error('Redis client not initialized. Call connectRedis() first.');
    }
    return redisClient;
};
