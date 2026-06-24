import { emitSearchMetric, emitPymkMetric, emitSimilarMetric } from '../analytics/metrics';

describe('metrics emitters', () => {
  let spy: jest.SpyInstance;
  beforeEach(() => {
    spy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    spy.mockRestore();
  });

  it('emitSearchMetric logs structured JSON to stdout', () => {
    emitSearchMetric({
      surface: 'preview',
      query: 'kathak',
      viewerId: 'u1',
      latencyMs: 187,
      resultCounts: { people: 12, gigs: 3, events: 1 },
      intent: { dominantVertical: 'people', confidence: 0.62 },
    });
    expect(spy).toHaveBeenCalledTimes(1);
    const out = JSON.parse(spy.mock.calls[0][0]);
    expect(out.metric).toBe('search');
    expect(out.surface).toBe('preview');
    expect(out.latencyMs).toBe(187);
  });

  it('emitPymkMetric logs', () => {
    emitPymkMetric({ viewerId: 'u1', latencyMs: 30, strategy: 'graph', total: 50, page: 1, fallback: false });
    const out = JSON.parse(spy.mock.calls[0][0]);
    expect(out.metric).toBe('pymk');
    expect(out.fallback).toBe(false);
  });

  it('emitSimilarMetric logs', () => {
    emitSimilarMetric({ artistId: 'a1', latencyMs: 25, mode: 'rail', total: 6, fallback: false });
    const out = JSON.parse(spy.mock.calls[0][0]);
    expect(out.metric).toBe('similar');
    expect(out.mode).toBe('rail');
  });
});
