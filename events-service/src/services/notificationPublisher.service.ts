import Redis from 'ioredis';

let _redis: Redis | null = null;

function getRedis(): Redis {
    if (!_redis) {
        _redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
            lazyConnect: true,
            maxRetriesPerRequest: 1,
            enableOfflineQueue: false,
        });
    }
    return _redis;
}

const CHANNEL = 'notification:events';

export interface NotificationPayload {
    subtype: string;
    eventId?: string;
    organizerId?: string;
    userId?: string;
    title?: string;
    [k: string]: any;
}

/**
 * Publishes notification event to Redis pub-sub channel consumed by
 * users-service notification.worker. The worker reads the subtype and
 * fans out to the correct channels (push/email/wa/sms) per its factory.
 */
export async function publishNotification(payload: NotificationPayload): Promise<void> {
    try {
        await getRedis().publish(CHANNEL, JSON.stringify({
            ...payload,
            ts: new Date().toISOString(),
        }));
    } catch (err) {
        console.error('publishNotification failed:', err);
        // Best-effort. Don't fail the parent operation.
    }
}
