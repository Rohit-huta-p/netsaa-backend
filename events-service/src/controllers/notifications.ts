import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import UserNotificationPreference, { DEFAULT_PREFERENCES } from '../models/UserNotificationPreference';

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
