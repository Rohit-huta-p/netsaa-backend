import EventNotification from '../models/EventNotification';
import { dispatchNotification } from '../services/notificationDispatch';

/** Send all queued notifications whose scheduledAt has passed. */
export async function processNotificationQueue(): Promise<number> {
  const due = await EventNotification.find({ status: 'queued', scheduledAt: { $lte: new Date() } }).limit(100);
  for (const row of due) {
    row.status = 'sending';
    await row.save();
    try {
      const { sentCount, failedCount } = await dispatchNotification(row);
      row.status = 'sent';
      row.sentAt = new Date();
      row.sentCount = sentCount;
      row.failedCount = failedCount;
    } catch (err) {
      row.status = 'failed';
      row.lastErrorMessage = (err as Error).message;
    }
    await row.save();
  }
  return due.length;
}
