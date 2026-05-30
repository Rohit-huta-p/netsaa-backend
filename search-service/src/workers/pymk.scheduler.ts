import { pymkRecomputeQueue } from './pymk.recompute.queue';
import mongoose from 'mongoose';

const CHUNK = 500;

export async function scheduleAllUsers(): Promise<{ enqueued: number; chunks: number }> {
  const usersColl = mongoose.connection.collection('users');
  const cursor = usersColl
    .find({ role: 'artist', blocked: { $ne: true } })
    .project({ _id: 1 });

  const ids: string[] = [];
  for await (const doc of cursor) ids.push(doc._id.toString());

  let chunks = 0;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    await pymkRecomputeQueue.addBulk(
      chunk.map(viewerId => ({
        name: 'pymk.recompute',
        data: { viewerId },
        opts: {
          removeOnComplete: true,
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
        },
      })),
    );
    chunks++;
  }
  return { enqueued: ids.length, chunks };
}

// CLI usage: node dist/workers/pymk.scheduler.js
if (require.main === module) {
  (async () => {
    await mongoose.connect(process.env.MONGO_URI!);
    const r = await scheduleAllUsers();
    console.log(JSON.stringify({ ok: true, ...r }));
    process.exit(0);
  })();
}
