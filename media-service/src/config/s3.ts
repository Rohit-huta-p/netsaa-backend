import { S3Client } from '@aws-sdk/client-s3';
import { env } from './env';

// ============================================================
// S3 CLIENT CONFIGURATION
// ============================================================

/**
 * AWS S3 Client (SDK v3)
 * 
 * Configured using values from validated env config.
 * This client is used by presign.service.ts to generate pre-signed URLs.
 * 
 * NO business logic here - only client instantiation.
 */
export const s3Client = new S3Client({
    region: env.aws.region,
    credentials: {
        accessKeyId: env.aws.accessKeyId,
        secretAccessKey: env.aws.secretAccessKey,
    },
    // AWS SDK ≥3.729 enables flexible checksums by default (WHEN_SUPPORTED). For a
    // presigned PutObject that bakes an `x-amz-checksum-crc32` into the URL computed
    // over the (empty) body at sign time (= AAAAAA==), so the real upload's bytes
    // never match and S3 rejects the PUT with a CRC32 mismatch. Only add a checksum
    // when the operation requires one → presigned PUT URLs stay checksum-free.
    requestChecksumCalculation: 'WHEN_REQUIRED',
});

// ============================================================
// S3 CONFIG EXPORT
// ============================================================

/**
 * S3 configuration object for use in services.
 * 
 * All values come from the validated env config.
 */
export const s3Config = {
    region: env.aws.region,
    bucket: env.aws.bucket,
    cdnBaseUrl: env.cdnBaseUrl,
    presignExpirySeconds: env.presignExpirySeconds,
} as const;

// ============================================================
// TYPE EXPORT
// ============================================================

export type S3Config = typeof s3Config;

console.log(`✅ [s3] S3 client configured for region: ${s3Config.region}`);
