import type { IntentResult, PymkItem, SimilarItem, RankWeights } from '../types/search.types';

describe('search.types', () => {
  it('IntentResult shape', () => {
    const r: IntentResult = {
      scores: { people: 1, gigs: 0, events: 0 },
      dominantVertical: 'people',
      confidence: 1,
      extracted: { crafts: [], cities: [], months: [], names: [] },
    };
    expect(r.dominantVertical).toBe('people');
  });

  it('PymkItem shape', () => {
    const p: PymkItem = { artistId: 'x', score: 0.5, reasons: ['mutual'], mutualCount: 1, craftOverlap: 0 };
    expect(p.score).toBe(0.5);
  });

  it('SimilarItem shape', () => {
    const s: SimilarItem = { peerId: 'y', score: 0.7, reasons: [], craftOverlap: 1, skillOverlap: 0.5, cityMatch: true };
    expect(s.cityMatch).toBe(true);
  });
});
