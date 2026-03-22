/* ─────────────────────────────────────────────
 *  email.queue.ts
 *  BullMQ Queue definition + shared Redis connection.
 *
 *  This file is the PRODUCER side only.
 *  The Worker (consumer) lives in email.worker.ts.
 * ───────────────────────────────────────────── */

import { Queue } from 'bullmq';
import IORedis from 'ioredis';

/* ── Redis connection shared across email module ── */
export const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

export const redisConnection = new IORedis(REDIS_URL, {
    maxRetriesPerRequest: null, // required by BullMQ
    enableReadyCheck: false,
});

/* ── Job payload types ── */

export interface WelcomeEmailJob {
    userId: string;
    email: string;
    displayName: string;
    role: string;
}

export interface PasswordResetEmailJob {
    userId: string;
    email: string;
    displayName: string;
    code: string;
}

export type EmailJobData = WelcomeEmailJob | PasswordResetEmailJob;
export type EmailJobName = 'welcome-email' | 'password-reset';

/* ── Queue (controllers enqueue jobs here) ── */

export const emailQueue = new Queue<EmailJobData, void, EmailJobName>('emailQueue', {
    connection: redisConnection,
    defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5_000 }, // 5s → 25s → 125s
        removeOnComplete: { count: 500 },
        removeOnFail: { count: 200 },
    },
});
