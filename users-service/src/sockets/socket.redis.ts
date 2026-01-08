import { Redis } from 'ioredis';
import { createAdapter } from '@socket.io/redis-adapter';
import dotenv from 'dotenv';

dotenv.config();

// TO ENABLE IN PRODUCTION:
// 1. Set ENABLE_SOCKET_REDIS=true in environment variables
// 2. Ensure REDIS_URL is set to a valid Redis instance
//
// WHY REDIS IS REQUIRED FOR SCALE:
// In a horizontal scaling setup (e.g., Kubernetes with multiple pods), sockets connected
// to one pod cannot communicate with sockets on another pod directly.
// The Redis Adapter solves this by using Redis Pub/Sub to broadcast events across all
// server instances. Without this, a user on Server A wouldn't receive real-time messages
// from a user on Server B.

const isRedisEnabled = process.env.ENABLE_SOCKET_REDIS === 'true';

let redisAdapter: any = undefined;
let pubClient: Redis | undefined = undefined;
let subClient: Redis | undefined = undefined;

if (isRedisEnabled) {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    console.log('Socket.IO Redis Adapter ENABLED');

    pubClient = new Redis(redisUrl);
    subClient = pubClient.duplicate();

    pubClient.on('error', (err) => console.error('Redis Pub Client Error', err));
    subClient.on('error', (err) => console.error('Redis Sub Client Error', err));

    redisAdapter = createAdapter(pubClient, subClient);
} else {
    // console.log('Socket.IO Redis Adapter DISABLED (Default behavior for local dev)');
}

export { redisAdapter, pubClient, subClient };
