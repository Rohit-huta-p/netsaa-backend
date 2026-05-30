import { computePymkForViewer } from '../workers/pymk.recompute.worker';

jest.mock('../people/viewer-graph.repo', () => ({
  loadFromMongo: jest.fn().mockResolvedValue({
    collaboratorIds: [],
    degree1ConnectionIds: ['c1', 'c2'],
    pymkTopIds: [],
  }),
}));
jest.mock('../workers/pymk.recompute.graph', () => ({
  degree2Candidates: jest.fn().mockResolvedValue([
    { artistId: 'a', mutualCount: 2, sharedCraft: true, sharedCity: false, lastActiveAt: new Date() },
    { artistId: 'b', mutualCount: 1, sharedCraft: false, sharedCity: true, lastActiveAt: new Date(Date.now() - 30 * 86400000) },
  ]),
}));

describe('computePymkForViewer', () => {
  it('ranks degree-2 candidates and returns top-N', async () => {
    const r = await computePymkForViewer('viewer1');
    expect(r.list.length).toBeGreaterThan(0);
    expect(r.list[0].score).toBeGreaterThanOrEqual(r.list[r.list.length - 1].score);
    expect(r.strategy).toBe('graph');
  });

  it('returns reasons for each item', async () => {
    const r = await computePymkForViewer('viewer1');
    expect(r.list[0].reasons.length).toBeGreaterThan(0);
  });
});
