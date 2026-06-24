jest.mock('bullmq', () => {
  const Queue = jest.fn().mockImplementation(() => ({
    upsertJobScheduler: jest.fn().mockResolvedValue(undefined),
  }));
  const Worker = jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    close: jest.fn().mockResolvedValue(undefined),
  }));
  return { Queue, Worker, Job: {} };
});
jest.mock('ioredis', () => jest.fn().mockImplementation(() => ({})));
jest.mock('../workers/pymk.recompute.queue', () => ({
  pymkRecomputeQueue: { upsertJobScheduler: jest.fn().mockResolvedValue(undefined) },
}));
jest.mock('../workers/pymk.scheduler', () => ({
  scheduleAllUsers: jest.fn().mockResolvedValue({ enqueued: 0, chunks: 0 }),
}));
jest.mock('../workers/pymk.recompute.worker', () => ({
  recomputeHandler: jest.fn().mockResolvedValue(undefined),
}));

import { bootPymkWorker, shutdownPymkWorker } from '../workers/pymk.boot';

describe('bootPymkWorker', () => {
  beforeEach(() => {
    const { pymkRecomputeQueue } = require('../workers/pymk.recompute.queue');
    (pymkRecomputeQueue.upsertJobScheduler as jest.Mock).mockClear();
  });

  afterEach(async () => {
    await shutdownPymkWorker();
  });

  it('registers scheduler on first call and returns schedulerRegistered: true', async () => {
    const r = await bootPymkWorker();
    expect(r.schedulerRegistered).toBe(true);
    expect(r.worker).toBeDefined();
  });

  it('upserts the JobScheduler with the 6h cron pattern', async () => {
    await bootPymkWorker();
    const { pymkRecomputeQueue } = require('../workers/pymk.recompute.queue');
    expect(pymkRecomputeQueue.upsertJobScheduler).toHaveBeenCalledTimes(1);
    const [id, schedule, jobTemplate] = pymkRecomputeQueue.upsertJobScheduler.mock.calls[0];
    expect(id).toBe('pymk.fanout.6h');
    expect(schedule.pattern).toBeDefined();
    expect(jobTemplate.name).toBe('pymk.fanout');
  });

  it('is idempotent — second call returns schedulerRegistered: false and skips re-register', async () => {
    await bootPymkWorker();
    const { pymkRecomputeQueue } = require('../workers/pymk.recompute.queue');
    const callsBefore = (pymkRecomputeQueue.upsertJobScheduler as jest.Mock).mock.calls.length;

    const r2 = await bootPymkWorker();
    expect(r2.schedulerRegistered).toBe(false);
    // upsertJobScheduler was NOT called again
    expect(pymkRecomputeQueue.upsertJobScheduler).toHaveBeenCalledTimes(callsBefore);
  });

  it('shutdownPymkWorker closes the worker and allows re-boot', async () => {
    const { Worker } = require('bullmq');
    await bootPymkWorker();
    const firstInstance = (Worker as jest.Mock).mock.results[0].value;

    await shutdownPymkWorker();
    expect(firstInstance.close).toHaveBeenCalledTimes(1);

    // Should be able to boot again after shutdown
    const r2 = await bootPymkWorker();
    expect(r2.schedulerRegistered).toBe(true);
  });
});
