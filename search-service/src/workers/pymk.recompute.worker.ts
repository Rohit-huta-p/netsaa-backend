import { Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { loadFromMongo } from '../people/viewer-graph.repo';
import { degree2Candidates } from './pymk.recompute.graph';
import { PymkRecommendation } from '../pymk/pymk.model';
import mongoose from 'mongoose';

const PYMK_LIST_LIMIT = 50;
const SCORE_WEIGHTS = {
  mutual: 0.4,
  craft:  0.3,
  city:   0.2,
  activity: 0.1,
};
const ACTIVITY_PIVOT_DAYS = 60;

function scoreCandidate(c: {
  mutualCount: number;
  sharedCraft: boolean;
  sharedCity: boolean;
  lastActiveAt: Date | null;
}): number {
  const activityRecency = c.lastActiveAt
    ? Math.max(0, 1 - (Date.now() - c.lastActiveAt.getTime()) / (ACTIVITY_PIVOT_DAYS * 86400000))
    : 0;
  return SCORE_WEIGHTS.mutual * Math.min(1, c.mutualCount / 5)
       + SCORE_WEIGHTS.craft  * (c.sharedCraft ? 1 : 0)
       + SCORE_WEIGHTS.city   * (c.sharedCity  ? 1 : 0)
       + SCORE_WEIGHTS.activity * activityRecency;
}

export interface ComputeResult {
  list: {
    artistId: string;
    score: number;
    reasons: string[];
    mutualCount: number;
    craftOverlap: number;
  }[];
  strategy: 'graph';
}

export async function computePymkForViewer(viewerId: string): Promise<ComputeResult> {
  const graph = await loadFromMongo(viewerId);
  const candidates = await degree2Candidates(viewerId, graph.degree1ConnectionIds);

  const ranked = candidates
    .map(c => ({
      artistId: c.artistId,
      score: scoreCandidate(c),
      reasons: [
        c.mutualCount > 0 ? `${c.mutualCount} mutual${c.mutualCount > 1 ? 's' : ''}` : null,
        c.sharedCraft ? 'same craft' : null,
        c.sharedCity  ? 'same city'  : null,
      ].filter((r): r is string => r !== null),
      mutualCount: c.mutualCount,
      craftOverlap: c.sharedCraft ? 1 : 0,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, PYMK_LIST_LIMIT);

  return { list: ranked, strategy: 'graph' };
}

export async function recomputeHandler(
  job: Job,
  compute: (viewerId: string) => Promise<ComputeResult> = computePymkForViewer,
): Promise<void> {
  const viewerId = job.data.viewerId as string;
  const out = await compute(viewerId);
  await PymkRecommendation.updateOne(
    { userId: new mongoose.Types.ObjectId(viewerId) } as any,
    {
      $set: {
        userId: new mongoose.Types.ObjectId(viewerId),
        strategy: out.strategy,
        list: out.list,
        computedAt: new Date(),
        version: 1,
      },
    },
    { upsert: true },
  );
}

// Worker bootstrap — only when run as standalone process
if (require.main === module) {
  const connection = new IORedis(
    process.env.REDIS_URL || 'redis://localhost:6379',
    { maxRetriesPerRequest: null }
  );
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const worker = new Worker('pymk.recompute', (job: Job) => recomputeHandler(job), { connection });
}
