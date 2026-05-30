import { cacheService } from '../cache/cache.service';
import { loadFromMongo, ViewerGraph } from './viewer-graph.repo';

const TTL_SECONDS = 300; // 5 min
const EMPTY: ViewerGraph = { collaboratorIds: [], degree1ConnectionIds: [], pymkTopIds: [] };

export async function fetchViewerGraph(viewerId?: string): Promise<ViewerGraph> {
  if (!viewerId) return EMPTY;
  const key = `viewer-graph:${viewerId}`;
  const cached = await cacheService.get<ViewerGraph>(key);
  if (cached) return cached;
  const fresh = await loadFromMongo(viewerId);
  await cacheService.set(key, fresh, TTL_SECONDS);
  return fresh;
}

export type { ViewerGraph } from './viewer-graph.repo';
