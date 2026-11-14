import { deleteS3Objects, s3KeyFromUrl } from '../utils/s3';
import { mux } from '../config/mux';
import { MediaAsset } from '../models/MediaAsset';

// ============================================================
// MEDIA CLEANUP SERVICE
// ============================================================
//
// Deletes media a user removed/replaced. Images live in S3 (deleted by key,
// reversed from the stored URL). Reels/event videos live in Mux — the client only
// ever holds `uploadId`/`playbackId`, so we look up the MediaAsset record here to
// get the `assetId` and delete the Mux asset (or cancel the direct upload if it is
// still `waiting` and has no asset yet). Best-effort + idempotent throughout: a
// missing S3 key, a missing record, or a Mux 404 is a no-op, so retries are safe.

export interface CleanupVideoRef {
    uploadId?: string;
    playbackId?: string;
}

export interface CleanupInput {
    images?: string[]; // stored public URLs
    videos?: CleanupVideoRef[];
}

export interface CleanupResult {
    imagesDeleted: number;
    imagesSkipped: number; // URL not recognised as ours
    videosDeleted: number;
    videosSkipped: number; // no matching record / no id
    errors: string[];
}

export async function cleanupMedia(input: CleanupInput): Promise<CleanupResult> {
    const result: CleanupResult = {
        imagesDeleted: 0,
        imagesSkipped: 0,
        videosDeleted: 0,
        videosSkipped: 0,
        errors: [],
    };

    // ---- Images → S3 ----
    const keys: string[] = [];
    for (const url of input.images ?? []) {
        const key = s3KeyFromUrl(url);
        if (key) keys.push(key);
        else result.imagesSkipped += 1;
    }
    if (keys.length) {
        try {
            await deleteS3Objects(keys);
            result.imagesDeleted += keys.length;
        } catch (e: any) {
            result.errors.push(`s3: ${e?.message ?? String(e)}`);
        }
    }

    // ---- Videos → Mux ----
    for (const v of input.videos ?? []) {
        const query = v.uploadId
            ? { uploadId: v.uploadId }
            : v.playbackId
                ? { playbackId: v.playbackId }
                : null;
        if (!query) {
            result.videosSkipped += 1;
            continue;
        }

        try {
            const rec = await MediaAsset.findOne(query);
            if (!rec) {
                result.videosSkipped += 1;
                continue;
            }

            if (rec.assetId) {
                await mux.video.assets.delete(rec.assetId).catch((e: any) => {
                    if (e?.status !== 404) throw e; // 404 = already gone
                });
            } else if (rec.uploadId) {
                // Still `waiting` — no asset exists yet, cancel the direct upload instead.
                await mux.video.uploads.cancel(rec.uploadId).catch(() => {
                    /* best-effort: upload may already be gone/settled */
                });
            }

            await rec.deleteOne();
            result.videosDeleted += 1;
        } catch (e: any) {
            // Leave the record in place so a retry can try again.
            result.errors.push(`mux: ${e?.message ?? String(e)}`);
            result.videosSkipped += 1;
        }
    }

    return result;
}
