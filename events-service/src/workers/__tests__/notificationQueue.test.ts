import mongoose from 'mongoose';
import EventNotification from '../../models/EventNotification';
import EventRegistration from '../../models/EventRegistration';
import * as dispatch from '../../services/notificationDispatch';
import { processNotificationQueue } from '../notificationQueueWorker';

jest.spyOn(dispatch, 'dispatchNotification').mockResolvedValue({ sentCount: 3, failedCount: 0 });
beforeEach(() => jest.clearAllMocks());

describe('processNotificationQueue', () => {
  it('dispatches due queued rows and marks them sent', async () => {
    const eventId = new mongoose.Types.ObjectId();
    await EventNotification.create({ eventId, kind: 'announcement', channels: ['push'], audience: 'confirmed', body: 'Hi', scheduledAt: new Date(Date.now() - 1000), status: 'queued' });
    await processNotificationQueue();
    const row = await EventNotification.findOne({ eventId });
    expect(dispatch.dispatchNotification).toHaveBeenCalledTimes(1);
    expect(row?.status).toBe('sent');
    expect(row?.sentCount).toBe(3);
  });

  it('skips rows scheduled in the future', async () => {
    const eventId = new mongoose.Types.ObjectId();
    await EventNotification.create({ eventId, kind: 'reminder_t24h', channels: ['push'], audience: 'all', body: 'Soon', scheduledAt: new Date(Date.now() + 3600000), status: 'queued' });
    await processNotificationQueue();
    expect(dispatch.dispatchNotification).toHaveBeenCalledTimes(0);
    expect((await EventNotification.findOne({ eventId }))?.status).toBe('queued');
  });
});
