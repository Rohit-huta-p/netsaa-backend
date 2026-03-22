import Redis from 'ioredis';

const CHANNEL = 'support-events';

let publisher: Redis | null = null;

/**
 * Get or create the Redis publisher instance.
 * Lazy initialization — only connects when first event is emitted.
 */
function getPublisher(): Redis {
    if (!publisher) {
        const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
        publisher = new Redis(redisUrl, {
            maxRetriesPerRequest: 3,
            lazyConnect: true,
        });

        publisher.on('error', (err) => {
            console.error('[Support EventEmitter] Redis error:', err.message);
        });

        publisher.on('connect', () => {
            console.log('[Support EventEmitter] Redis connected');
        });
    }
    return publisher;
}

/**
 * Emit a support event via Redis Pub/Sub.
 * Other services subscribe to the 'support-events' channel.
 *
 * @param event - Event name (e.g., 'support.ticket.created')
 * @param payload - Event data object
 */
export async function emitSupportEvent(
    event: string,
    payload: Record<string, any>
): Promise<void> {
    try {
        const redis = getPublisher();
        const message = JSON.stringify({
            event,
            payload,
            timestamp: new Date().toISOString(),
            source: 'support-service',
        });

        await redis.publish(CHANNEL, message);
        console.log(`[Support Event] ${event}`, payload);
    } catch (error) {
        // Events are fire-and-forget — log but don't crash
        console.error(`[Support EventEmitter] Failed to emit ${event}:`, error);
    }
}

/**
 * Gracefully disconnect the Redis publisher.
 * Call this during server shutdown.
 */
export async function disconnectEventEmitter(): Promise<void> {
    if (publisher) {
        await publisher.quit();
        publisher = null;
        console.log('[Support EventEmitter] Redis disconnected');
    }
}
