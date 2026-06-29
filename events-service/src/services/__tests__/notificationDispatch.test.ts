import mongoose from 'mongoose';
import EventRegistration from '../../models/EventRegistration';
import UserNotificationPreference from '../../models/UserNotificationPreference';
import * as providers from '../notificationProviders';
import { dispatchNotification, prefCategoryForKind } from '../notificationDispatch';

jest.spyOn(providers, 'sendPush').mockResolvedValue(true);
jest.spyOn(providers, 'sendEmail').mockResolvedValue(true);
jest.spyOn(providers, 'sendSms').mockResolvedValue(true);

beforeEach(() => jest.clearAllMocks());

const eventId = new mongoose.Types.ObjectId();

async function confirmedUser(prefs?: any) {
  const userId = new mongoose.Types.ObjectId();
  await EventRegistration.create({ eventId, userId, quantity: 1, status: 'registered', idempotencyKey: `k-${userId}`, source: 'standard', visibility: 'public' });
  if (prefs) await UserNotificationPreference.create({ userId, ...prefs });
  return userId;
}

describe('prefCategoryForKind', () => {
  it('maps reminder kinds to reminders, announcement to announcements, review_prompt to reviews', () => {
    expect(prefCategoryForKind('reminder_t24h')).toBe('reminders');
    expect(prefCategoryForKind('announcement')).toBe('announcements');
    expect(prefCategoryForKind('review_prompt')).toBe('reviews');
  });
  it('returns null for transactional kinds (always-send)', () => {
    expect(prefCategoryForKind('confirmation')).toBeNull();
    expect(prefCategoryForKind('cancellation')).toBeNull();
  });
});

describe('dispatchNotification', () => {
  it('an announcement respects the user announcements.sms=false default (no SMS)', async () => {
    await confirmedUser(); // defaults: announcements.sms=false
    const notification = { _id: new mongoose.Types.ObjectId(), eventId, kind: 'announcement', channels: ['push', 'email', 'sms'], audience: 'confirmed', body: 'Bring ghungroo', subject: 'Note' } as any;
    const result = await dispatchNotification(notification);
    expect(providers.sendPush).toHaveBeenCalledTimes(1);
    expect(providers.sendEmail).toHaveBeenCalledTimes(1);
    expect(providers.sendSms).toHaveBeenCalledTimes(0); // filtered out by preference
    expect(result.sentCount).toBe(2);
  });

  it('a transactional confirmation bypasses preferences (always push+email)', async () => {
    await confirmedUser({ reminders: { push: false, email: false, sms: false }, announcements: { push: false, email: false, sms: false }, reviews: { push: false, email: false, sms: false } });
    const notification = { _id: new mongoose.Types.ObjectId(), eventId, kind: 'confirmation', channels: ['push', 'email'], audience: 'confirmed', body: 'You are in' } as any;
    await dispatchNotification(notification);
    expect(providers.sendPush).toHaveBeenCalledTimes(1);  // sent despite all prefs off
    expect(providers.sendEmail).toHaveBeenCalledTimes(1);
  });
});
