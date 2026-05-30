import { Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import mongoose from 'mongoose';
import { SimilarArtists } from '../similar/similar.model';

const SIMILAR_LIMIT = 20;
const SCORE_WEIGHTS = { craft: 0.5, skill: 0.3, city: 0.2 };
const CANDIDATE_LIMIT = 100;

export function scoreSim(s: { craftOverlap: number; skillOverlap: number; cityMatch: boolean }): number {
  return SCORE_WEIGHTS.craft * s.craftOverlap
       + SCORE_WEIGHTS.skill * s.skillOverlap
       + SCORE_WEIGHTS.city  * (s.cityMatch ? 1 : 0);
}

export interface SimilarComputeResult {
  artistId: string;
  list: {
    peerId: mongoose.Types.ObjectId;
    score: number;
    reasons: string[];
    craftOverlap: number;
    skillOverlap: number;
    cityMatch: boolean;
  }[];
  computedAt: Date;
}

export async function computeSimilarForArtist(artistId: string): Promise<SimilarComputeResult> {
  const users = mongoose.connection.collection('users');
  let aid: mongoose.Types.ObjectId;
  try {
    aid = new mongoose.Types.ObjectId(artistId);
  } catch {
    return { artistId, list: [], computedAt: new Date() };
  }

  const me = await users.findOne(
    { _id: aid },
    { projection: { artistType: 1, skills: 1, 'cached.primaryCity': 1 } }
  );
  if (!me) return { artistId, list: [], computedAt: new Date() };

  const candidates = await users.find({
    _id: { $ne: aid },
    artistType: me.artistType,
    blocked: { $ne: true },
    role: 'artist',
  }).project({ _id: 1, skills: 1, 'cached.primaryCity': 1 }).limit(CANDIDATE_LIMIT).toArray();

  const mySkills: string[] = me.skills ?? [];

  const ranked = candidates.map((c: any) => {
    const theirs: string[] = c.skills ?? [];
    const shared = theirs.filter(s => mySkills.includes(s)).length;
    const skillOverlap = mySkills.length ? shared / mySkills.length : 0;
    const cityMatch = !!me.cached?.primaryCity && c.cached?.primaryCity === me.cached.primaryCity;
    return {
      peerId: c._id,
      craftOverlap: 1, // same artistType filtered above
      skillOverlap,
      cityMatch,
      reasons: [
        'same craft',
        skillOverlap > 0 ? `${shared} shared skills` : null,
        cityMatch ? 'same city' : null,
      ].filter((r): r is string => r !== null),
      score: scoreSim({ craftOverlap: 1, skillOverlap, cityMatch }),
    };
  })
  .sort((a, b) => b.score - a.score)
  .slice(0, SIMILAR_LIMIT);

  return { artistId, list: ranked, computedAt: new Date() };
}

// Worker bootstrap — only when run as standalone process
if (require.main === module) {
  const connection = new IORedis(
    process.env.REDIS_URL || 'redis://localhost:6379',
    { maxRetriesPerRequest: null }
  );
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const worker = new Worker('similar.recompute', async (job: Job) => {
    const artistId = job.data.artistId as string;
    const out = await computeSimilarForArtist(artistId);
    await SimilarArtists.updateOne(
      { artistId: new mongoose.Types.ObjectId(artistId) } as any,
      { $set: { ...out, artistId: new mongoose.Types.ObjectId(artistId) } },
      { upsert: true },
    );
  }, { connection });
}
