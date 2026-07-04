import Mux from '@mux/mux-node';
import { env } from './env';

// One shared Mux client. Reads credentials explicitly from validated env.
export const mux = new Mux({
  tokenId: env.mux.tokenId,
  tokenSecret: env.mux.tokenSecret,
  webhookSecret: env.mux.webhookSecret,
});

// Phase-1 policy: public playback, free Basic encoding tier.
export const MUX_ASSET_SETTINGS = {
  playback_policy: ['public'],
  video_quality: 'basic',
} as { playback_policy: ('public')[]; video_quality: 'basic' };

export const MAX_VIDEO_DURATION_SECONDS = 65; // 60s picker cap + rounding buffer

export const playbackUrl = (playbackId: string) => `https://stream.mux.com/${playbackId}.m3u8`;
export const posterUrl = (playbackId: string) => `https://image.mux.com/${playbackId}/thumbnail.jpg?time=1`;
