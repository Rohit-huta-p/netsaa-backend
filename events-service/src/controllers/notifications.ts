import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import UserNotificationPreference, { DEFAULT_PREFERENCES } from '../models/UserNotificationPreference';
import Event from '../models/Event';
import EventNotification from '../models/EventNotification';

export const getPreferences = async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id || req.user?._id;
  const pref = await UserNotificationPreference.findOne({ userId });
  const data = pref
    ? { reminders: pref.reminders, announcements: pref.announcements, reviews: pref.reviews }
    : DEFAULT_PREFERENCES;
  return res.status(200).json({ meta: { status: 200, message: 'OK' }, data, errors: [] });
};

export const updatePreferences = async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id || req.user?._id;
  const current = (await UserNotificationPreference.findOne({ userId }))
    ?? await UserNotificationPreference.create({ userId });
  for (const cat of ['reminders', 'announcements', 'reviews'] as const) {
    if (req.body[cat]) {
      for (const ch of ['push', 'email', 'sms'] as const) {
        if (typeof req.body[cat][ch] === 'boolean') (current as any)[cat][ch] = req.body[cat][ch];
      }
    }
  }
  await current.save();
  return res.status(200).json({ meta: { status: 200, message: 'Updated' }, data: { reminders: current.reminders, announcements: current.announcements, reviews: current.reviews }, errors: [] });
};

const ANNOUNCEMENT_DAILY_LIMIT = 5;

export const createAnnouncement = async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id || req.user?._id;
  const event = await Event.findById(req.params.id);
  if (!event) return res.status(404).json({ meta: { status: 404, message: 'Event not found' }, data: null, errors: [] });
  if (event.organizerId.toString() !== String(userId)) return res.status(403).json({ meta: { status: 403, message: 'Not your event' }, data: null, errors: [] });

  const since = new Date(Date.now() - 86400000);
  const todayCount = await EventNotification.countDocuments({ eventId: event._id, kind: 'announcement', createdAt: { $gte: since } });
  if (todayCount >= ANNOUNCEMENT_DAILY_LIMIT) {
    return res.status(429).json({ meta: { status: 429, message: `Daily announcement limit (${ANNOUNCEMENT_DAILY_LIMIT}) reached` }, data: null, errors: [] });
  }

  const { body, channels = ['push'], audience = 'confirmed', subject } = req.body;
  if (!body?.trim()) return res.status(400).json({ meta: { status: 400, message: 'Message body required' }, data: null, errors: [] });

  const row = await EventNotification.create({
    eventId: event._id, kind: 'announcement', channels, audience, subject, body: body.slice(0, 1000),
    scheduledAt: new Date(), status: 'queued', initiatedBy: userId,
  });
  return res.status(201).json({ meta: { status: 201, message: 'Announcement queued' }, data: { notificationId: row._id }, errors: [] });
};
