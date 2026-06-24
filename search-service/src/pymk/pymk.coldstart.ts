import mongoose from 'mongoose';

export interface ColdStartItem {
  artistId: string;
  score: number;
  reasons: string[];
  mutualCount: number;
  craftOverlap: number;
}

export interface ColdStartResult {
  list: ColdStartItem[];
  strategy: 'contacts' | 'craft-city';
}

export async function buildColdStart(viewerId: string): Promise<ColdStartResult> {
  // Phase 1 cold-start: craft + city match using user's own profile fields.
  // Contact-matching is left for a follow-up (requires phone-contacts permission flow on mobile).
  const usersColl = mongoose.connection.collection('users');
  let viewerObjId: mongoose.Types.ObjectId;
  try {
    viewerObjId = new mongoose.Types.ObjectId(viewerId);
  } catch {
    return { list: [], strategy: 'craft-city' };
  }

  const me = await usersColl.findOne(
    { _id: viewerObjId },
    { projection: { artistType: 1, 'cached.primaryCity': 1 } }
  );
  if (!me?.artistType || !me?.cached?.primaryCity) {
    return { list: [], strategy: 'craft-city' };
  }

  const candidates = await usersColl.find({
    _id: { $ne: viewerObjId },
    artistType: me.artistType,
    'cached.primaryCity': me.cached.primaryCity,
    blocked: { $ne: true },
    role: 'artist',
  }).project({ _id: 1 }).limit(50).toArray();

  return {
    list: candidates.map((c: any) => ({
      artistId: c._id.toString(),
      score: 0.5,
      reasons: ['same craft', 'same city'],
      mutualCount: 0,
      craftOverlap: 1,
    })),
    strategy: 'craft-city',
  };
}
