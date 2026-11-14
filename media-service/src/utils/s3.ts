import { DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { s3Client, s3Config } from '../config';

// ============================================================
// S3 OBJECT DELETION + URL→KEY REVERSAL
// ============================================================
//
// media-service is the only place that knows how a stored public URL maps to an
// S3 key (see presign.service.ts: `${cdn}/${key}` when CDN_BASE_URL is set, else
// the virtual-hosted `https://<bucket>.s3.<region>.amazonaws.com/<key>`). Sibling
// services that remove media send us the URLs; we reverse them and delete.

/**
 * Reverse a stored public URL back into its S3 object key.
 *
 * Accepts only URLs that belong to OUR bucket/CDN — a foreign URL (a Mux
 * `image.mux.com` thumbnail, an external link in `featured`, anything else)
 * returns null so it is never used to delete an object. For both the CDN and the
 * virtual-hosted S3 form the key is exactly the URL path (minus the leading `/`).
 */
export function s3KeyFromUrl(rawUrl: string): string | null {
    if (!rawUrl || typeof rawUrl !== 'string') return null;

    let u: URL;
    try {
        u = new URL(rawUrl);
    } catch {
        return null;
    }

    const host = u.hostname.toLowerCase();
    const key = decodeURIComponent(u.pathname.replace(/^\/+/, ''));
    if (!key) return null;

    // CDN host (when configured)
    if (s3Config.cdnBaseUrl) {
        try {
            const cdnHost = new URL(s3Config.cdnBaseUrl).hostname.toLowerCase();
            if (host === cdnHost) return key;
        } catch {
            /* malformed CDN config — fall through to the S3 host check */
        }
    }

    // Virtual-hosted S3: <bucket>.s3.amazonaws.com or <bucket>.s3.<region>.amazonaws.com.
    // Match any region so a stored URL survives a bucket-region change.
    const b = s3Config.bucket.toLowerCase();
    if (host === `${b}.s3.amazonaws.com` || (host.startsWith(`${b}.s3.`) && host.endsWith('.amazonaws.com'))) {
        return key;
    }

    return null;
}

/**
 * Batch-delete S3 objects by key. Idempotent (deleting a missing key succeeds).
 * S3 caps DeleteObjects at 1000 keys per request, so we chunk.
 */
export async function deleteS3Objects(keys: string[]): Promise<void> {
    const unique = [...new Set(keys.filter(Boolean))];
    for (let i = 0; i < unique.length; i += 1000) {
        const chunk = unique.slice(i, i + 1000);
        await s3Client.send(
            new DeleteObjectsCommand({
                Bucket: s3Config.bucket,
                Delete: { Objects: chunk.map((Key) => ({ Key })), Quiet: true },
            }),
        );
    }
}
