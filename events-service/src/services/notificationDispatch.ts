import EventRegistration from '../models/EventRegistration';
import WaitlistEntry from '../models/WaitlistEntry';
import UserNotificationPreference, { DEFAULT_PREFERENCES } from '../models/UserNotificationPreference';
import { sendPush, sendEmail, sendSms } from './notificationProviders';

type Category = 'reminders' | 'announcements' | 'reviews';
type Channel = 'push' | 'email' | 'sms';

const REMINDER_KINDS = new Set(['reminder_t7d', 'reminder_t24h', 'reminder_t2h', 'waitlist_promoted']);
const TRANSACTIONAL = new Set(['confirmation', 'cancellation', 'refund_processed', 'reschedule']);

/** Which preference category gates a kind — or null if it's transactional (always-send). */
export function prefCategoryForKind(kind: string): Category | null {
  if (TRANSACTIONAL.has(kind)) return null;
  if (REMINDER_KINDS.has(kind)) return 'reminders';
  if (kind === 'announcement') return 'announcements';
  if (kind === 'review_prompt') return 'reviews';
  return 'reminders';
}

async function resolveAudience(notification: any): Promise<string[]> {
  const { eventId, audience, customAudienceUserIds } = notification;
  if (audience === 'custom') return (customAudienceUserIds || []).map((id: any) => id.toString());
  if (audience === 'waitlisted') {
    const w = await WaitlistEntry.find({ eventId, status: { $in: ['waiting', 'promoted'] } }).select('userId');
    return w.map((e: any) => e.userId.toString());
  }
  const statusFilter = audience === 'vip'
    ? { eventId, status: { $in: ['registered', 'attended'] }, tags: 'vip' }
    : { eventId, status: { $in: ['registered', 'attended'] } }; // 'all' + 'confirmed' both = active registrants
  const regs = await EventRegistration.find(statusFilter).select('userId');
  return regs.map((r: any) => r.userId.toString());
}

async function allowsChannel(userId: string, category: Category | null, channel: Channel): Promise<boolean> {
  if (category === null) return channel !== 'sms'; // transactional → push+email only, always
  const pref = await UserNotificationPreference.findOne({ userId });
  const matrix: any = pref ?? DEFAULT_PREFERENCES;
  return !!matrix[category]?.[channel];
}

export async function dispatchNotification(notification: any): Promise<{ sentCount: number; failedCount: number }> {
  const category = prefCategoryForKind(notification.kind);
  const recipients = await resolveAudience(notification);
  let sentCount = 0, failedCount = 0;

  for (const userId of recipients) {
    for (const channel of notification.channels as Channel[]) {
      if (!(await allowsChannel(userId, category, channel))) continue;
      try {
        const ok = channel === 'push' ? await sendPush(userId, notification.subject || 'NETSA', notification.body)
          : channel === 'email' ? await sendEmail(userId, notification.subject || 'NETSA', notification.body)
          : await sendSms(userId, notification.body);
        ok ? sentCount++ : failedCount++;
      } catch { failedCount++; }
    }
  }
  return { sentCount, failedCount };
}
