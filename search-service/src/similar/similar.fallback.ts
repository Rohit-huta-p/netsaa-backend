import mongoose from 'mongoose';

export interface FallbackItem {
  peerId: string;
  score: number;
  reasons: string[];
  craftOverlap: number;
  skillOverlap: number;
  cityMatch: boolean;
}

export async function buildSimilarFallback(artistId: string, limit = 20): Promise<FallbackItem[]> {
  const usersColl = mongoose.connection.collection('users');
  let aid: mongoose.Types.ObjectId;
  try {
    aid = new mongoose.Types.ObjectId(artistId);
  } catch {
    return [];
  }

  const me = await usersColl.findOne(
    { _id: aid },
    { projection: { artistType: 1, 'cached.primaryCity': 1 } }
  );
  if (!me) return [];

  const candidates = await usersColl.find({
    _id: { $ne: aid },
    artistType: me.artistType,
    'cached.primaryCity': me.cached?.primaryCity,
    blocked: { $ne: true },
    role: 'artist',
  }).project({ _id: 1 }).limit(limit).toArray();

  return candidates.map((c: any) => ({
    peerId: c._id.toString(),
    score: 0.4,
    reasons: ['craft+city fallback'],
    craftOverlap: 1,
    skillOverlap: 0,
    cityMatch: true,
  }));
}
