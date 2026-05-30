import { fetchViewerGraph } from '../people/viewer-graph';

jest.mock('../cache/cache.service', () => ({
  cacheService: {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
  },
}));
jest.mock('../people/viewer-graph.repo', () => ({
  loadFromMongo: jest.fn().mockResolvedValue({
    collaboratorIds: ['a', 'b'],
    degree1ConnectionIds: ['c'],
    pymkTopIds: ['d'],
  }),
}));

describe('fetchViewerGraph', () => {
  it('returns from repo on cache miss and sets cache', async () => {
    const g = await fetchViewerGraph('viewer1');
    expect(g.collaboratorIds).toEqual(['a', 'b']);
    expect(g.degree1ConnectionIds).toEqual(['c']);
    expect(g.pymkTopIds).toEqual(['d']);
  });

  it('returns empty arrays when viewerId is undefined', async () => {
    const g = await fetchViewerGraph(undefined);
    expect(g).toEqual({ collaboratorIds: [], degree1ConnectionIds: [], pymkTopIds: [] });
  });
});
