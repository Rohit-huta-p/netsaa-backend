import { Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { pymkRecomputeQueue } from './pymk.recompute.queue';
import { scheduleAllUsers } from './pymk.scheduler';
import { recomputeHandler } from './pymk.recompute.worker';

const SCHEDULER_ID = 'pymk.fanout.6h';
const CRON_PATTERN = process.env.PYMK_CRON_PATTERN || '0 */6 * * *'; // every 6h on the hour
const WORKER_CONCURRENCY = parseInt(process.env.PYMK_WORKER_CONCURRENCY || '10', 10);

let bootedWorker: Worker | null = null;

export async function bootPymkWorker(): Promise<{ worker: Worker; schedulerRegistered: boolean }> {
  if (bootedWorker) {
    return { worker: bootedWorker, schedulerRegistered: false };
  }

  const connection = new IORedis(
    process.env.REDIS_URL || 'redis://localhost:6379',
    { maxRetriesPerRequest: null },
  );

  // 1. Register/refresh the JobScheduler (idempotent — safe to call on every boot)
  await pymkRecomputeQueue.upsertJobScheduler(
    SCHEDULER_ID,
    { pattern: CRON_PATTERN },
    {
      name: 'pymk.fanout',
      data: {},
      opts: { removeOnComplete: true, attempts: 2 },
    },
  );

  // 2. Start the dispatcher worker. Routes by job.name.
  const worker = new Worker(
    'pymk.recompute',
    async (job: Job) => {
      if (job.name === 'pymk.fanout') {
        const result = await scheduleAllUsers();
        return result;
      }
      // Default: per-user recompute job
      return recomputeHandler(job);
    },
    { connection, concurrency: WORKER_CONCURRENCY },
  );

  worker.on('failed', (job, err) => {
    console.error(JSON.stringify({
      ts: new Date().toISOString(),
      metric: 'pymk.worker.failed',
      jobId: job?.id,
      name: job?.name,
      error: err?.message,
    }));
  });

  bootedWorker = worker;
  return { worker, schedulerRegistered: true };
}

export async function shutdownPymkWorker(): Promise<void> {
  if (bootedWorker) {
    await bootedWorker.close();
    bootedWorker = null;
  }
}
