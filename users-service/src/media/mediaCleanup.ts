/* ─────────────────────────────────────────────
 *  mediaCleanup.ts
 *  Delete orphaned media when a profile removes/replaces it.
 *
 *  Profile saves send the WHOLE media arrays, so we diff the stored doc against
 *  what's being written and hand the removed items to media-service (the single
 *  S3 + Mux deletion authority) via its internal endpoint.
 *
 *  Fire-and-forget by design: the profile save must never block on, or fail
 *  because of, media cleanup. A lost call is backstopped by the periodic sweeper.
 * ───────────────────────────────────────────── */

const MEDIA_SERVICE_URL = (process.env.MEDIA_SERVICE_URL ?? 'http://localhost:5004').replace(/\/$/, '');
const INTERNAL_TOKEN = process.env.INTERNAL_SERVICE_TOKEN ?? '';

export interface VideoRef {
    uploadId?: string;
    playbackId?: string;
}

export interface RemovedMedia {
    images: string[]; // stored public URLs (S3)
    videos: VideoRef[]; // Mux reels, by uploadId / playbackId
}

const strArr = (v: any): string[] =>
    Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.length > 0) : [];

/**
 * Diff the removed media on a User doc given the fields being written.
 * `incoming` is the $set payload — we only consider a field when it's actually
 * present in the PATCH (an absent field is NOT "all removed").
 */
export function diffRemovedUserMedia(before: any, incoming: Record<string, any>): RemovedMedia {
    const images: string[] = [];
    const videos: VideoRef[] = [];
    if (!before) return { images, videos };

    // Single-value image fields: replaced or cleared.
    for (const f of ['profileImageUrl', 'coverImageUrl'] as const) {
        if (f in incoming) {
            const oldV = before[f];
            if (typeof oldV === 'string' && oldV && oldV !== incoming[f]) images.push(oldV);
        }
    }

    // Flat string[] image fields.
    const diffArr = (oldArr: string[], newArr: string[]) => {
        const keep = new Set(newArr);
        for (const u of oldArr) if (!keep.has(u)) images.push(u);
    };
    if ('galleryUrls' in incoming) diffArr(strArr(before.galleryUrls), strArr(incoming.galleryUrls));
    if ('videoUrls' in incoming) diffArr(strArr(before.videoUrls), strArr(incoming.videoUrls)); // legacy S3 videos

    // Structured gallery [{ url }].
    if ('gallery' in incoming) {
        const oldUrls = (Array.isArray(before.gallery) ? before.gallery : [])
            .map((g: any) => g?.url)
            .filter((x: any): x is string => typeof x === 'string' && x.length > 0);
        const keep = new Set(
            (Array.isArray(incoming.gallery) ? incoming.gallery : [])
                .map((g: any) => g?.url)
                .filter((x: any) => typeof x === 'string'),
        );
        for (const u of oldUrls) if (!keep.has(u)) images.push(u);
    }

    // Featured attachments: image urls/thumbnails (S3) + mux playbackIds (video).
    if ('featured' in incoming) {
        const flatten = (arr: any) => {
            const imgs: string[] = [];
            const pbs: string[] = [];
            for (const f of Array.isArray(arr) ? arr : []) {
                for (const a of Array.isArray(f?.attachments) ? f.attachments : []) {
                    if (typeof a?.url === 'string' && a.url && (a.type === 'photo' || a.type === 'pdf')) imgs.push(a.url);
                    if (typeof a?.thumbnailUrl === 'string' && a.thumbnailUrl) imgs.push(a.thumbnailUrl);
                    if (typeof a?.muxPlaybackId === 'string' && a.muxPlaybackId) pbs.push(a.muxPlaybackId);
                }
            }
            return { imgs, pbs };
        };
        const o = flatten(before.featured);
        const n = flatten(incoming.featured);
        const keepImg = new Set(n.imgs);
        for (const u of o.imgs) if (!keepImg.has(u)) images.push(u);
        const keepPb = new Set(n.pbs);
        for (const p of o.pbs) if (!keepPb.has(p)) videos.push({ playbackId: p });
    }

    // Video reels (Mux): removed when neither uploadId nor muxPlaybackId survives.
    if ('videoReels' in incoming) {
        const oldReels = Array.isArray(before.videoReels) ? before.videoReels : [];
        const newReels = Array.isArray(incoming.videoReels) ? incoming.videoReels : [];
        const keepUpload = new Set(newReels.map((r: any) => r?.uploadId).filter(Boolean));
        const keepPb = new Set(newReels.map((r: any) => r?.muxPlaybackId).filter(Boolean));
        for (const r of oldReels) {
            const uid: string | undefined = r?.uploadId || undefined;
            const pb: string | undefined = r?.muxPlaybackId || undefined;
            const stillThere = (uid && keepUpload.has(uid)) || (pb && keepPb.has(pb));
            if (!stillThere && (uid || pb)) videos.push({ uploadId: uid, playbackId: pb });
        }
    }

    return { images: [...new Set(images)], videos };
}

/**
 * Diff removed media on an Organizer doc (logoUrl + photos[]) given the $set payload.
 */
export function diffRemovedOrganizerMedia(before: any, setFields: Record<string, any>): RemovedMedia {
    const images: string[] = [];
    if (before) {
        if ('logoUrl' in setFields && typeof before.logoUrl === 'string' && before.logoUrl && before.logoUrl !== setFields.logoUrl) {
            images.push(before.logoUrl);
        }
        if ('photos' in setFields) {
            const keep = new Set(strArr(setFields.photos));
            for (const u of strArr(before.photos)) if (!keep.has(u)) images.push(u);
        }
    }
    return { images: [...new Set(images)], videos: [] };
}

/**
 * Fire-and-forget: ask media-service to delete the removed media. Never awaited
 * by callers — any failure is logged and left for the sweeper to reconcile.
 */
export function requestMediaCleanup(removed: RemovedMedia): void {
    if (!removed || (!removed.images.length && !removed.videos.length)) return;
    if (!INTERNAL_TOKEN) {
        console.warn('[mediaCleanup] INTERNAL_SERVICE_TOKEN unset — skipping media cleanup');
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
