// src/tests/preview.service.v2.test.ts
import { searchPreviewService } from '../modules/search/search.preview.service';

jest.mock('../modules/search/search.service', () => ({
  searchService: {
    searchPeople: jest.fn().mockResolvedValue({ results: Array(5).fill({ _id: 'p' }), meta: { total: 5 } }),
    searchGigs:   jest.fn().mockResolvedValue({ results: Array(5).fill({ _id: 'g' }), meta: { total: 5 } }),
    searchEvents: jest.fn().mockResolvedValue({ results: Array(5).fill({ _id: 'e' }), meta: { total: 5 } }),
  },
}));

describe('searchPreviewService.executePreview', () => {
  it('returns top-5 per vertical in preview mode (default)', async () => {
    const r = await searchPreviewService.executePreview('kathak pune', { mode: 'preview' });
    expect(r.people).toHaveLength(5);
    expect(r.gigs).toHaveLength(5);
    expect(r.events).toHaveLength(5);
    expect(r.intent.dominantVertical).toBe('people');
    expect(r.order).toEqual(['people', 'gigs', 'events']);
  });

  it('returns top 3/2/1 in typeahead mode', async () => {
    const r = await searchPreviewService.executePreview('kathak pune', { mode: 'typeahead' });
    expect(r.people).toHaveLength(3);
    expect(r.gigs).toHaveLength(2);
    expect(r.events).toHaveLength(1);
  });

  it('reorders rails for "sangeet march" → gigs first', async () => {
    const r = await searchPreviewService.executePreview('sangeet march', { mode: 'preview' });
    expect(r.order[0]).toBe('gigs');
  });

  it('ambiguous query → default people → gigs → events', async () => {
    const r = await searchPreviewService.executePreview('dance', { mode: 'preview' });
    expect(r.order).toEqual(['people', 'gigs', 'events']);
  });

  it('passes viewerId to searchPeople for graph-aware ranking', async () => {
    const { searchService } = require('../modules/search/search.service');
    searchService.searchPeople.mockClear();
    await searchPreviewService.executePreview('kathak', { mode: 'preview', viewerId: 'user123' });
    expect(searchService.searchPeople).toHaveBeenCalledWith('kathak', {}, 1, 'user123');
  });
});
