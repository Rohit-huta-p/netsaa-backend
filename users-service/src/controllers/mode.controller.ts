import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import User from '../models/User';

type Mode = 'artist' | 'hirer';
const VALID_MODES: Mode[] = ['artist', 'hirer'];

/**
 * PATCH /me/mode
 * Body: { mode: 'artist' | 'hirer' }
 * Updates the server-side mirror of client mode. Non-blocking — client does
 * NOT wait on this. Used as Layer-2 fallback when client AsyncStorage is empty
 * (see spec §2.4).
 */
export const patchMode = async (req: AuthRequest, res: Response) => {
  const userId = (req.user as any)?.id || (req.user as any)?._id;
  if (!userId) {
    return res.status(401).json({
      meta: { status: 401, message: 'Not authorized' },
      errors: [{ message: 'No user in token' }],
    });
  }

  const mode = req.body?.mode;
  if (!VALID_MODES.includes(mode)) {
    return res.status(400).json({
      meta: { status: 400, message: 'Invalid mode' },
      errors: [{ message: `mode must be one of: ${VALID_MODES.join(', ')}` }],
    });
  }

  try {
    const now = new Date();
    const updateFields: Record<string, any> = { lastActiveMode: mode };
    if (mode === 'artist') updateFields.lastArtistActionAt = now;
    else updateFields.lastHirerActionAt = now;

    const user = await User.findByIdAndUpdate(
      userId,
      { $set: updateFields },
      { new: true, runValidators: true, select: 'lastActiveMode lastArtistActionAt lastHirerActionAt' }
    );

    if (!user) {
      return res.status(404).json({
        meta: { status: 404, message: 'User not found' },
        errors: [{ message: 'User record missing' }],
      });
    }

    return res.status(200).json({
      meta: { status: 200, message: 'Mode synced' },
      data: {
        lastActiveMode: user.lastActiveMode,
        lastArtistActionAt: user.lastArtistActionAt,
        lastHirerActionAt: user.lastHirerActionAt,
      },
    });
  } catch (err: any) {
    console.error('[patchMode] error:', err);
    return res.status(500).json({
      meta: { status: 500, message: 'Internal error' },
      errors: [{ message: err?.message ?? 'Unknown error' }],
    });
  }
};
