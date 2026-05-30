import mongoose from 'mongoose';

export interface ViewerGraph {
  collaboratorIds: string[];
  degree1ConnectionIds: string[];
  pymkTopIds: string[];
}

export async function loadFromMongo(viewerId: string): Promise<ViewerGraph> {
  const usersColl = mongoose.connection.collection('users');
  const connColl = mongoose.connection.collection('connections');
  const pymkColl = mongoose.connection.collection('pymk_recommendations');

  const viewerObjId = new mongoose.Types.ObjectId(viewerId);

  const user = await usersColl.findOne(
    { _id: viewerObjId },
    { projection: { 'cached.connectionStats.collaboratorIds': 1 } }
  );
  const collaboratorIds: string[] = (user?.cached?.connectionStats?.collaboratorIds ?? [])
    .map((id: any) => id.toString());

  const conns = await connColl.find({
    $or: [
      { requesterId: viewerObjId, status: 'accepted' },
      { recipientId: viewerObjId, status: 'accepted' },
    ],
  }, { projection: { requesterId: 1, recipientId: 1 } }).toArray();

  const degree1ConnectionIds: string[] = conns.map((c: any) => {
    const r = c.requesterId.toString();
    const rcp = c.recipientId.toString();
    return r === viewerId ? rcp : r;
  });

  const pymk = await pymkColl.findOne(
    { userId: viewerObjId },
    { projection: { 'list.artistId': 1 } }
  );
  const pymkTopIds: string[] = (pymk?.list ?? [])
    .slice(0, 50)
    .map((it: any) => it.artistId.toString());

  return { collaboratorIds, degree1ConnectionIds, pymkTopIds };
}
