import Event from '../models/Event';
import EventNotification from '../models/EventNotification';

const T7D = 7 * 86400000, T24H = 86400000, T2H = 2 * 3600000;

/** Enqueue the standard reminder set for a live event. Idempotent per (event, kind). */
export async function scheduleEventReminders(eventId: any): Promise<void> {
  const event = await Event.findById(eventId);
  if (!event || event.status !== 'live') return;
  const start = new Date(event.schedule.startDate).getTime();
  const isOnline = event.location?.type === 'online' || event.location?.type === 'hybrid';

  const rows = [
    { kind: 'reminder_t7d', at: start - T7D, channels: ['push'], body: `${event.title} is in 7 days.` },
    { kind: 'reminder_t24h', at: start - T24H, channels: ['push', 'email'], body: isOnline ? `${event.title} is tomorrow — your join link is now available.` : `${event.title} is tomorrow.` },
    { kind: 'reminder_t2h', at: start - T2H, channels: ['push', 'sms'], body: `${event.title} starts in 2 hours.` },
  ];

  for (const r of rows) {
    if (r.at <= Date.now()) continue; // don't schedule a past reminder
    await EventNotification.findOneAndUpdate(
      { eventId: event._id, kind: r.kind },
      { eventId: event._id, kind: r.kind, channels: r.channels, audience: 'confirmed', body: r.body, scheduledAt: new Date(r.at), status: 'queued' },
      { upsert: true, setDefaultsOnInsert: true },
    );
  }
}
