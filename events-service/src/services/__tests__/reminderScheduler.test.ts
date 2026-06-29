import mongoose from 'mongoose';
import Event from '../../models/Event';
import EventNotification from '../../models/EventNotification';
import { scheduleEventReminders } from '../reminderScheduler';

async function liveEvent(over: any = {}) {
  return Event.create({
    title: 'K', description: 'x', eventType: 'workshop', category: 'dance',
    organizerId: new mongoose.Types.ObjectId(), organizerSnapshot: { name: 'S', organizationName: 'Sawai' },
    pricingMode: 'fixed', ticketPrice: 0,
    schedule: { startDate: new Date(Date.now() + 8 * 86400000), endDate: new Date(Date.now() + 9 * 86400000), totalDurationMinutes: 120, dayBreakdown: [] },
    location: { type: 'physical', city: 'Pune', state: 'MH', country: 'IN' },
    maxParticipants: 24, status: 'live', ...over,
  });
}

describe('scheduleEventReminders', () => {
  it('enqueues T-7d, T-24h, T-2h reminders for a live event (idempotent)', async () => {
    const e = await liveEvent();
    await scheduleEventReminders(e._id);
    await scheduleEventReminders(e._id); // re-run must not duplicate
    const kinds = (await EventNotification.find({ eventId: e._id })).map((n: any) => n.kind).sort();
    expect(kinds).toEqual(['reminder_t24h', 'reminder_t2h', 'reminder_t7d']);
  });

  it('adds an online reveal reminder at the reveal time', async () => {
    const e = await liveEvent({ location: { type: 'online', city: 'Pune', state: 'MH', country: 'IN', meetingLink: 'https://zoom.us/j/1', meetingLinkRevealAt: 'T-24h' } });
    await scheduleEventReminders(e._id);
    const reveal = await EventNotification.findOne({ eventId: e._id, kind: 'reminder_t24h' });
    expect(reveal?.body).toMatch(/link/i);
  });
});
