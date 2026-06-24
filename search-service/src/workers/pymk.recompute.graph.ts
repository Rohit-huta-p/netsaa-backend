import mongoose from 'mongoose';

export interface Candidate {
  artistId: string;
  mutualCount: number;
  sharedCraft: boolean;
  sharedCity: boolean;
  lastActiveAt: Date | null;
}

export async function degree2Candidates(viewerId: string, degree1Ids: string[]): Promise<Candidate[]> {
  if (!degree1Ids.length) return [];

  const conns = mongoose.connection.collection('connections');
  const users = mongoose.connection.collection('users');

  const objViewerId = new mongoose.Types.ObjectId(viewerId);
  const d1ObjIds = degree1Ids.map(i => new mongoose.Types.ObjectId(i));

  // For each accepted connection where either side is in degree1Ids, project the OTHER side.
  // Exclude self and existing degree-1.
  const cursor = conns.aggregate([
    { $match: { status: 'accepted', $or: [{ requesterId: { $in: d1ObjIds } }, { recipientId: { $in: d1ObjIds } }] } },
    {
      $project: {
        other: {
          $cond: [
            { $in: ['$requesterId', d1ObjIds] },
            '$recipientId',
            '$requesterId',
          ],
        },
      },
    },
    { $match: { other: { $ne: objViewerId, $nin: d1ObjIds } } },
    { $group: { _id: '$other', mutualCount: { $sum: 1 } } },
    { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'u' } },
    { $unwind: '$u' },
    { $match: { 'u.blocked': { $ne: true }, 'u.role': 'artist' } },
    {
      $project: {
        artistId: '$_id',
        mutualCount: 1,
        artistType: '$u.artistType',
        primaryCity: '$u.cached.primaryCity',
        lastActiveAt: '$u.lastActiveAt',
      },
    },
    { $limit: 200 },
  ]);

  const me = await users.findOne(
    { _id: objViewerId },
    { projection: { artistType: 1, 'cached.primaryCity': 1 } }
  );

  const out: Candidate[] = [];
  for await (const doc of cursor) {
    out.push({
      artistId: doc.artistId.toString(),
      mutualCount: doc.mutualCount,
      sharedCraft: !!me?.artistType && doc.artistType === me.artistType,
      sharedCity:  !!me?.cached?.primaryCity && doc.primaryCity === me.cached.primaryCity,
      lastActiveAt: doc.lastActiveAt ?? null,
    });
  }
  return out;
}
