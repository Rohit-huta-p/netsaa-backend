// src/tests/preview.controller.test.ts
import request from 'supertest';
import express from 'express';
import { searchRoutes } from '../modules/search/search.routes';

jest.mock('../modules/search/search.preview.service', () => ({
  searchPreviewService: {
    executePreview: jest.fn().mockImplementation((_query: string, opts: any = {}) =>
      Promise.resolve({
        people: [], gigs: [], events: [],
        intent: { scores: { people: 0, gigs: 0, events: 0 }, dominantVertical: 'people', confidence: 0, extracted: { crafts: [], cities: [], months: [], names: [] } },
        order: ['people', 'gigs', 'events'],
        mode: opts.mode ?? 'preview',
      })
    ),
  },
}));

const app = express();
app.use('/search', searchRoutes);

describe('GET /search/preview', () => {
  it('returns 200 with intent + order + mode echoed', async () => {
    const res = await request(app).get('/search/preview?q=hi&mode=typeahead');
    expect(res.status).toBe(200);
    expect(res.body.intent.dominantVertical).toBe('people');
    expect(res.body.order).toEqual(['people', 'gigs', 'events']);
    expect(res.body.mode).toBe('typeahead');
  });

  it('passes mode + viewerId from request to service', async () => {
    const { searchPreviewService } = require('../modules/search/search.preview.service');
    searchPreviewService.executePreview.mockClear();
    await request(app).get('/search/preview?q=hi&mode=typeahead&viewerId=u1');
    expect(searchPreviewService.executePreview).toHaveBeenCalledWith('hi', expect.objectContaining({ mode: 'typeahead', viewerId: 'u1' }));
  });
});
