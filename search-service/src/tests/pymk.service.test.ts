import { pymkService } from '../pymk/pymk.service';

jest.mock('../pymk/pymk.model', () => ({
  PymkRecommendation: { findOne: jest.fn() },
}));
jest.mock('../pymk/pymk.coldstart', () => ({
  buildColdStart: jest.fn().mockResolvedValue({
    list: [{ artistId: 'cold1', score: 0.5, reasons: ['fallback'], mutualCount: 0, craftOverlap: 0 }],
    strategy: 'craft-city',
  }),
}));
jest.mock('../modules/enrichment/enrich.people', () => ({
  enrichPeopleResults: jest.fn().mockImplementation((ids: string[]) =>
    Promise.resolve(ids.map(id => ({ _id: id, displayName: `N-${id}` })))
  ),
}));

describe('pymkService.read', () => {
  const { PymkRecommendation } = require('../pymk/pymk.model');

  it('returns enriched paginated list when doc exists', async () => {
    PymkRecommendation.findOne.mockResolvedValue({
      list: Array(15).fill(0).map((_, i) => ({
        artistId: `a${i}`, score: 1 - i / 100, reasons: [`r${i}`], mutualCount: 0, craftOverlap: 0,
      })),
      computedAt: new Date(),
      strategy: 'graph',
    });
    const r = await pymkService.read('viewer1', 1, 10);
    expect(r.items).toHaveLength(10);
    expect(r.total).toBe(15);
    expect(r.strategy).toBe('graph');
  });

  it('uses cold-start when doc missing', async () => {
    PymkRecommendation.findOne.mockResolvedValue(null);
    const r = await pymkService.read('viewer-new', 1, 10);
    expect(r.strategy).toBe('craft-city');
    expect(r.items).toHaveLength(1);
  });

  it('paginates correctly', async () => {
    PymkRecommendation.findOne.mockResolvedValue({
      list: Array(25).fill(0).map((_, i) => ({
        artistId: `a${i}`, score: 1 - i / 100, reasons: [], mutualCount: 0, craftOverlap: 0,
      })),
      computedAt: new Date(),
      strategy: 'graph',
    });
    const page2 = await pymkService.read('viewer1', 2, 10);
    expect(page2.items).toHaveLength(10);
    expect(page2.items[0]._id).toBe('a10');
  });
});
