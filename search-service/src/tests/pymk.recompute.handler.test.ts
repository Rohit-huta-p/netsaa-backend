import { recomputeHandler } from '../workers/pymk.recompute.worker';

jest.mock('../pymk/pymk.model', () => ({
  PymkRecommendation: { updateOne: jest.fn().mockResolvedValue({ upsertedCount: 1 }) },
}));

// computePymkForViewer is passed via DI — no module-level mock needed for the handler tests.

describe('recomputeHandler', () => {
  beforeEach(() => {
    const { PymkRecommendation } = require('../pymk/pymk.model');
    (PymkRecommendation.updateOne as jest.Mock).mockClear();
  });

  it('invokes injected compute fn with the viewerId from job data', async () => {
    const mockCompute = jest.fn().mockResolvedValue({
      list: [{ artistId: 'a1', score: 0.8, reasons: ['2 mutuals'], mutualCount: 2, craftOverlap: 0 }],
      strategy: 'graph' as const,
    });
    const job: any = { data: { viewerId: '507f1f77bcf86cd799439011' } };

    await recomputeHandler(job, mockCompute);

    expect(mockCompute).toHaveBeenCalledTimes(1);
    expect(mockCompute).toHaveBeenCalledWith('507f1f77bcf86cd799439011');
  });

  it('upserts pymk_recommendations doc with correct fields', async () => {
    const mockCompute = jest.fn().mockResolvedValue({
      list: [{ artistId: 'a1', score: 0.8, reasons: ['2 mutuals'], mutualCount: 2, craftOverlap: 0 }],
      strategy: 'graph' as const,
    });
    const job: any = { data: { viewerId: '507f1f77bcf86cd799439011' } };

    await recomputeHandler(job, mockCompute);

    const { PymkRecommendation } = require('../pymk/pymk.model');
    expect(PymkRecommendation.updateOne).toHaveBeenCalledTimes(1);

    const [filter, update, opts] = (PymkRecommendation.updateOne as jest.Mock).mock.calls[0];
    expect(filter.userId.toString()).toBe('507f1f77bcf86cd799439011');
    expect(update.$set.strategy).toBe('graph');
    expect(update.$set.list).toHaveLength(1);
    expect(update.$set.computedAt).toBeInstanceOf(Date);
    expect(update.$set.version).toBe(1);
    expect(opts).toEqual({ upsert: true });
  });

  it('propagates errors from the compute fn', async () => {
    const mockCompute = jest.fn().mockRejectedValue(new Error('graph load failed'));
    const job: any = { data: { viewerId: '507f1f77bcf86cd799439011' } };

    await expect(recomputeHandler(job, mockCompute)).rejects.toThrow('graph load failed');
  });
});
