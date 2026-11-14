/* ─────────────────────────────────────────────
 *  mediaCleanup.client.ts
 *  Delete event media from S3/Mux when it is removed/replaced on edit, or when
 *  the event is deleted. Fire-and-forget to media-service (the single delete
 *  authority) via its internal endpoint — never blocks or fails the request.
 *  Mirrors users-service's media cleanup; HTTP pattern follows followNotify.client.ts.
 *
 *  Event media lives in ONE `media[]` array where each item is { kind:'photo'|'video',
 *  url?, uploadId?, muxPlaybackId?, thumbnailUrl?, ... }: photos carry an S3 `url`,
 *  videos carry Mux `uploadId`/`muxPlaybackId` (a video's thumbnailUrl is a Mux URL,
 *  not S3, so it is intentionally not sent as an image).
 * ───────────────────────────────────────────── */

const MEDIA_SERVICE_URL = (process.env.MEDIA_SERVICE_URL ?? 'http://localhost:5004').replace(/\/$/, '');
const INTERNAL_TOKEN = process.env.INTERNAL_SERVICE_TOKEN ?? '';

export interface VideoRef {
    uploadId?: string;
    playbackId?: string;
}

export interface RemovedMedia {
    images: string[];
    videos: VideoRef[];
}

const isVideoItem = (m: any): boolean => m?.kind === 'video' || !!m?.uploadId || !!m?.muxPlaybackId;

/** Flatten an event `media[]` into { images: photo S3 urls, videos: Mux refs }. */
export function mediaRefs(media: any[]): RemovedMedia {
    const images: string[] = [];
    const videos: VideoRef[] = [];
    for (const m of Array.isArray(media) ? media : []) {
        if (isVideoItem(m)) {
            if (m?.uploadId || m?.muxPlaybackId) {
                videos.push({ uploadId: m.uploadId || undefined, playbackId: m.muxPlaybackId || undefined });
            }
        } else if (typeof m?.url === 'string' && m.url) {
            images.push(m.url);
        }
    }
    return { images, videos };
}

/** Media present in `oldMedia` but gone from `newMedia` (photos by url, videos by uploadId/playbackId). */
export function diffRemovedEventMedia(oldMedia: any[], newMedia: any[]): RemovedMedia {
    const oldR = mediaRefs(oldMedia);
    const nw = mediaRefs(newMedia);
    const keepImg = new Set(nw.images);
    const keepUpload = new Set(nw.videos.map((v) => v.uploadId).filter(Boolean));
    const keepPb = new Set(nw.videos.map((v) => v.playbackId).filter(Boolean));
    return {
        images: [...new Set(oldR.images.filter((u) => !keepImg.has(u)))],
        videos: oldR.videos.filter(
            (v) => !((v.uploadId && keepUpload.has(v.uploadId)) || (v.playbackId && keepPb.has(v.playbackId))),
        ),
    };
}

/** Fire-and-forget delete request. Never awaited by callers; failures are logged. */
export function requestMediaCleanup(removed: RemovedMedia): void {
    if (!removed || (!removed.images.length && !removed.videos.length)) return;
    if (!INTERNAL_TOKEN) {
        console.warn('[mediaCleanup] INTERNAL_SERVICE_TOKEN unset — skipping event media cleanup');
        return;
    }
    fetch(`${MEDIA_SERVICE_URL}/v1/media/internal/cleanup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${INTERNAL_TOKEN}` },
        body: JSON.stringify(removed),
    })
        .then((r) => {
            if (!r.ok) console.warn(`[mediaCleanup] media-service responded ${r.status}`);
        })
        .catch((e: any) => console.warn('[mediaCleanup] request failed:', e?.message ?? String(e)));
}
