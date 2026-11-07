import { Request, Response } from 'express';
import User from '../models/User';

// Called by media-service on Mux asset ready/errored. Idempotent.
export async function attachMedia(req: Request, res: Response): Promise<void> {
  const { userId, uploadId, playbackId, thumbnailUrl, duration, aspectRatio, status } = req.body || {};
  if (!userId || !uploadId || !status) { res.status(400).json({ error: 'BAD_REQUEST' }); return; }

  const user = await User.findById(userId);
  if (!user) { res.status(404).json({ error: 'NOT_FOUND' }); return; }

  const reels: any[] = user.videoReels || [];
  const reel = reels.find((r: any) => r.uploadId === uploadId);
  if (!reel) { res.status(202).json({ pending: true }); return; } // FE hasn't saved it yet

  reel.status = status;
  if (playbackId) reel.muxPlaybackId = playbackId;
  if (thumbnailUrl) reel.thumbnailUrl = thumbnailUrl;
  if (typeof duration === 'number') reel.duration = duration;
  if (aspectRatio) reel.aspectRatio = aspectRatio;
  user.markModified('videoReels');
  await user.save();
  res.status(200).json({ ok: true });
}
