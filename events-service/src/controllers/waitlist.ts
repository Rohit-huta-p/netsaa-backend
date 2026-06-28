import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import Event from '../models/Event';
import WaitlistEntry from '../models/WaitlistEntry';
import { slotsLeftForEvent, nextPosition } from '../services/waitlistService';

// @route POST /v1/events/:id/waitlist/join
export const joinWaitlist = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id || req.user?._id;
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ meta: { status: 404, message: 'Event not found' }, data: null, errors: [] });
    if (!event.allowWaitlist) return res.status(409).json({ meta: { status: 409, message: 'Waitlist not enabled' }, data: null, errors: [] });
    if ((await slotsLeftForEvent(event._id)) > 0) return res.status(409).json({ meta: { status: 409, message: 'Seats available — register instead' }, data: null, errors: [] });

    const existing = await WaitlistEntry.findOne({ eventId: event._id, userId });
    if (existing && ['waiting', 'promoted'].includes(existing.status)) {
      return res.status(409).json({ meta: { status: 409, message: 'Already on the waitlist' }, data: null, errors: [] });
    }

    const position = await nextPosition(event._id);
    const entry = await WaitlistEntry.findOneAndUpdate(
      { eventId: event._id, userId },
      {
        eventId: event._id, userId, position,
        quantity: Math.max(1, Math.min(event.maxGuestsPerRegistration || 5, req.body.quantity || 1)),
        status: 'waiting', joinedAt: new Date(),
        attendeeSnapshot: req.body.attendeeSnapshot,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    return res.status(201).json({ meta: { status: 201, message: 'Joined waitlist' }, data: { entryId: entry._id, position: entry.position, status: entry.status }, errors: [] });
  } catch (err) {
    return res.status(400).json({ meta: { status: 400, message: 'Join failed' }, data: null, errors: [{ message: (err as Error).message }] });
  }
};

// @route DELETE /v1/events/:id/waitlist
export const leaveWaitlist = async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id || req.user?._id;
  const entry = await WaitlistEntry.findOne({ eventId: req.params.id, userId });
  if (!entry) return res.status(404).json({ meta: { status: 404, message: 'Not on the waitlist' }, data: null, errors: [] });
  entry.status = 'declined';
  await entry.save();
  return res.status(200).json({ meta: { status: 200, message: 'Left the waitlist' }, data: { status: 'declined' }, errors: [] });
};
