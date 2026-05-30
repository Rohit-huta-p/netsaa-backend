import { PEOPLE_WEIGHTS_V2 } from './weights';
import type { ViewerGraph } from '../people/viewer-graph';

export function buildPeopleRankingClausesV2(query: string, graph: ViewerGraph): any[] {
  const out: any[] = [];
  const w = PEOPLE_WEIGHTS_V2;
  const q = query?.trim();

  // Query-driven SHOULDs (only when query is non-empty)
  if (q) {
    out.push({
      autocomplete: { query: q, path: 'displayName', fuzzy: { maxEdits: 1 },
        score: { boost: { value: w.NAME_MATCH } } },
    });
    out.push({
      text: { query: q, path: 'artistType', fuzzy: { maxEdits: 1 },
        score: { boost: { value: w.ARTIST_TYPE_MATCH } } },
    });
    out.push({
      text: { query: q, path: 'skills',
        score: { boost: { value: w.SKILLS_MATCH } } },
    });
    out.push({
      text: { query: q, path: 'cached.primaryCity',
        score: { boost: { value: w.CITY_MATCH } } },
    });
    out.push({
      text: { query: q, path: 'bio',
        score: { boost: { value: w.BIO_MATCH } } },
    });
  }

  // Graph SHOULDs (viewer-aware). Skip when arrays empty (Atlas rejects empty `value` arrays).
  if (graph.collaboratorIds.length) {
    out.push({ in: { path: '_id', value: graph.collaboratorIds,
      score: { boost: { value: w.GRAPH_COLLAB } } } });
  }
  if (graph.degree1ConnectionIds.length) {
    out.push({ in: { path: '_id', value: graph.degree1ConnectionIds,
      score: { boost: { value: w.GRAPH_DEGREE1 } } } });
  }
  if (graph.pymkTopIds.length) {
    out.push({ in: { path: '_id', value: graph.pymkTopIds,
      score: { boost: { value: w.GRAPH_PYMK } } } });
  }

  // Soft quality signals (always)
  out.push({ range: { path: 'cached.averageRating', gte: 4,
    score: { boost: { value: w.RATING_BOOST } } } });
  out.push({ range: { path: 'cached.connectionStats.degree1Count', gt: 50,
    score: { boost: { value: w.POPULARITY_BOOST } } } });
  out.push({ near: { path: 'lastActiveAt', origin: new Date(),
    pivot: 7 * 24 * 60 * 60 * 1000,
    score: { boost: { value: w.ACTIVITY_BOOST } } } });

  return out;
}
