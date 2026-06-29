import { Request, Response } from 'express';
import EventRegistration from '../models/EventRegistration';

// @route GET /v1/events/:id/roster/public  (no PII — names + count only)
export const getPublicRoster = async (req: Request, res: Response) => {
  const regs = await EventRegistration.find({ eventId: req.params.id, status: { $in: ['registered', 'attended'] }, visibility: 'public' })
    .select('attendees quantity')
    .limit(50);
  const names = regs.map((r: any) => r.attendees?.[0]?.fullName).filter(Boolean);
  return res.status(200).json({ meta: { status: 200, message: 'OK' }, data: { count: names.length, names: names.slice(0, 12) }, errors: [] });
};
