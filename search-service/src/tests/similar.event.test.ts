import { onProfileUpdated } from '../indexing/consumers/user.consumer';

jest.mock('../workers/similar.recompute.queue', () => ({
  similarRecomputeQueue: { add: jest.fn().mockResolvedValue(undefined) },
}));

describe('onProfileUpdated', () => {
  const { similarRecomputeQueue } = require('../workers/similar.recompute.queue');
  beforeEach(() => similarRecomputeQueue.add.mockReset());

  it('enqueues similar.recompute when changedFields includes artistType', async () => {
    await onProfileUpdated({ userId: 'u1', changedFields: ['artistType'] });
    expect(similarRecomputeQueue.add).toHaveBeenCalledWith('similar.recompute', { artistId: 'u1' });
  });

  it('enqueues when changedFields includes skills', async () => {
    await onProfileUpdated({ userId: 'u1', changedFields: ['skills'] });
    expect(similarRecomputeQueue.add).toHaveBeenCalled();
  });

  it('does NOT enqueue when changedFields is unrelated', async () => {
    await onProfileUpdated({ userId: 'u1', changedFields: ['email'] });
    expect(similarRecomputeQueue.add).not.toHaveBeenCalled();
  });
});
