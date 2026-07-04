import { Request, Response } from 'express';
import Event from '../models/Event';

// Called by media-service on Mux asset ready/errored. Idempotent.
export async function attachMedia(req: Request, res: Response): Promise<void> {
  const { eventId, uploadId, playbackId, thumbnailUrl, duration, aspectRatio, status } = req.body || {};
  if (!eventId || !uploadId || !status) { res.status(400).json({ error: 'BAD_REQUEST' }); return; }

  const ev = await Event.findById(eventId);
  if (!ev) { res.status(404).json({ error: 'NOT_FOUND' }); return; }

  const entry = (ev.media || []).find((m: any) => m.uploadId === uploadId);
  if (!entry) { res.status(202).json({ pending: true }); return; } // client hasn't PATCHed yet

  entry.status = status;
  if (playbackId) entry.muxPlaybackId = playbackId;
  if (thumbnailUrl) entry.thumbnailUrl = thumbnailUrl;
  if (typeof duration === 'number') entry.duration = duration;
  if (aspectRatio) entry.aspectRatio = aspectRatio;
  ev.markModified('media');
  await ev.save();
  res.status(200).json({ ok: true });
}
