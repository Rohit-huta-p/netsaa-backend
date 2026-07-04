import { env } from '../config/env';
import { posterUrl } from '../config/mux';

export interface AttachInput {
  eventId: string;
  uploadId: string;
  playbackId?: string;
  duration?: number;
  aspectRatio?: string;
  status: 'ready' | 'errored';
}

// Push the resolved video to events-service. Best-effort with small retry.
export async function attachToEvent(input: AttachInput): Promise<void> {
  const body = {
    eventId: input.eventId,
    uploadId: input.uploadId,
    playbackId: input.playbackId,
    thumbnailUrl: input.playbackId ? posterUrl(input.playbackId) : undefined,
    duration: input.duration,
    aspectRatio: input.aspectRatio,
    status: input.status,
  };
  const url = `${env.eventsServiceUrl}/internal/events/media/attach`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.internalServiceToken}` },
        body: JSON.stringify(body),
      });
      if (res.ok || res.status === 202) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
  }
}
