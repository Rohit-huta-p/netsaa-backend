/**
 * Data backfill · 2026-07-06 · Refresh gig-comment author avatars
 *
 * Older gig comments stored authorImageUrl from the JWT's login-time
 * profileImageUrl snapshot (often empty/stale), so they render the default
 * avatar or a wrong image. This re-resolves authorName + authorImageUrl for
 * every GigComment from the author's CURRENT User record.
 *   - author has a photo   → authorImageUrl set to it
 *   - author has no photo  → authorImageUrl set to null (frontend shows no-profile.png)
 *   - author not found     → left untouched
 *
 * Run:      ts-node src/migrations/2026-07-06-backfill-comment-author-avatars.ts [--dry-run]
 * SAFE TO RE-RUN (idempotent — only writes rows whose name/image actually differ).
 * REQUIRES: GIGS_MONGO_URI (or MONGO_URI) — loaded from .env.
 */
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import GigComment from '../models/GigComment';
import User from '../models/User';

dotenv.config();

const MONGO_URI = process.env.GIGS_MONGO_URI || process.env.MONGO_URI;
if (!MONGO_URI) { console.error('✗ GIGS_MONGO_URI (or MONGO_URI) env var required'); process.exit(1); }
const DRY_RUN = process.argv.includes('--dry-run');
const log = (m: string) => console.log(`[backfill-avatars] ${m}`);

async function main() {
  log(`Connecting to MongoDB...${DRY_RUN ? ' (DRY RUN — no writes)' : ''}`);
  await mongoose.connect(MONGO_URI!);
  log('✓ Connected');
  try {
    const comments: any[] = await GigComment.find({})
      .select('authorId authorName authorImageUrl')
      .lean();
    log(`Found ${comments.length} gig comments`);

    // Resolve every distinct author once.
    const authorIds = [...new Set(comments.map((c) => String(c.authorId)).filter(Boolean))];
    const users: any[] = await User.find({ _id: { $in: authorIds } })
      .select('displayName firstName lastName profileImageUrl')
      .lean();
    const byId = new Map(users.map((u) => [String(u._id), u]));
    log(`Resolved ${byId.size}/${authorIds.length} authors`);

    const ops: any[] = [];
    let unchanged = 0, missingAuthor = 0;
    for (const c of comments) {
      const u = byId.get(String(c.authorId));
      if (!u) { missingAuthor++; continue; }
      const freshName =
        u.displayName || `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || 'User';
      const freshImg = u.profileImageUrl || null; // null → frontend renders no-profile.png
      const nameChanged = (c.authorName || '') !== freshName;
      const imgChanged = (c.authorImageUrl || null) !== freshImg;
      if (!nameChanged && !imgChanged) { unchanged++; continue; }
      ops.push({
        updateOne: {
          filter: { _id: c._id },
          update: { $set: { authorName: freshName, authorImageUrl: freshImg } },
        },
      });
    }
    log(`To update: ${ops.length} · already-correct: ${unchanged} · author-not-found: ${missingAuthor}`);

    if (DRY_RUN) {
      log('DRY RUN — no writes performed');
    } else if (ops.length) {
      const res = await GigComment.bulkWrite(ops, { ordered: false });
      log(`✓ Updated ${res.modifiedCount} comments`);
    } else {
      log('Nothing to update');
    }
    log('✓ Backfill complete');
  } catch (err) {
    console.error('✗ Backfill failed:', err);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
    log('Disconnected');
  }
}
main();
