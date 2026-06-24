import { similarService } from '../similar/similar.service';

jest.mock('../similar/similar.model', () => ({
  SimilarArtists: { findOne: jest.fn() },
}));
jest.mock('../modules/enrichment/enrich.people', () => ({
  enrichPeopleResults: jest.fn().mockImplementation((ids: string[]) =>
    Promise.resolve(ids.map(id => ({ _id: id, displayName: `N-${id}` })))
  ),
}));
jest.mock('../similar/similar.fallback', () => ({
  buildSimilarFallback: jest.fn().mockResolvedValue([
    { peerId: 'fb1', score: 0.3, reasons: ['craft+city'], craftOverlap: 1, skillOverlap: 0, cityMatch: true },
  ]),
}));

describe('similarService.read', () => {
  const { SimilarArtists } = require('../similar/similar.model');

  it('returns rail (limit=6) when doc exists', async () => {
    SimilarArtists.findOne.mockResolvedValue({
      list: Array(20).fill(0).map((_, i) => ({
        peerId: `p${i}`, score: 1 - i / 100, reasons: [], craftOverlap: 1, skillOverlap: 0, cityMatch: true,
      })),
      computedAt: new Date(),
    });
    const r = await similarService.read('artist1', { limit: 6 });
    expect(r.items).toHaveLength(6);
    expect(r.total).toBe(20);
  });

  it('returns paginated page when page+pageSize given', async () => {
    SimilarArtists.findOne.mockResolvedValue({
      list: Array(20).fill(0).map((_, i) => ({
        peerId: `p${i}`, score: 1 - i / 100, reasons: [], craftOverlap: 1, skillOverlap: 0, cityMatch: true,
      })),
      computedAt: new Date(),
    });
    const r = await similarService.read('artist1', { page: 2, pageSize: 5 });
    expect(r.items).toHaveLength(5);
    expect(r.items[0]._id).toBe('p5');
  });

  it('uses fallback when doc missing', async () => {
    SimilarArtists.findOne.mockResolvedValue(null);
    const r = await similarService.read('artist-new', { limit: 6 });
    expect(r.items).toHaveLength(1);
    expect(r.total).toBe(1);
    expect(r.computedAt).toBeNull();
  });
});
