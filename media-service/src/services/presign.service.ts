import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { s3Client, s3Config } from '../config';
import { AuthUser } from '../middleware/auth';
import { EntityType, generateFileKey, buildPublicUrl, isValidObjectId } from '../utils/fileKey';
import { Purpose, isAllowedMimeType, isMimeAllowedForPurpose, getMaxSizeForPurpose, isFileSizeAllowed } from '../utils/mime';
import { checkUploadPermission, PermissionError } from './permission.service';

// ============================================================
// ERRORS
// ============================================================

export class PresignError extends Error {
    constructor(
        message: string,
        public code: string,
        public statusCode: number = 400
    ) {
        super(message);
        this.name = 'PresignError';
    }
}

// ============================================================
// TYPES
// ============================================================

export interface PresignRequest {
    entityType: EntityType;
    entityId: string;
    purpose: Purpose;
    mimeType: string;
    fileSize: number;
}

export interface PresignResponse {
    uploadUrl: string;
    fileUrl: string;
    key: string;
    expiresIn: number;
}

// ============================================================
// PRESIGN SERVICE
// ============================================================

/**
 * Generates a pre-signed PUT URL for S3 upload.
 * 
 * Steps:
 * 1. Validate inputs
 * 2. Check permissions
 * 3. Generate S3 key
 * 4. Create pre-signed URL
 * 
 * @throws PresignError for validation failures
 * @throws PermissionError for authorization failures
 */
export async function generatePresignedUrl(
    user: AuthUser,
    request: PresignRequest
): Promise<PresignResponse> {
    const { entityType, entityId, purpose, mimeType, fileSize } = request;

    // 1. Validate entity ID format
    if (!isValidObjectId(entityId)) {
        throw new PresignError(
            `Invalid entity ID format: ${entityId}`,
            'INVALID_ENTITY_ID',
            400
        );
    }

    // 2. Validate MIME type is globally allowed
    if (!isAllowedMimeType(mimeType)) {
        throw new PresignError(
            `MIME type '${mimeType}' is not allowed`,
            'INVALID_MIME_TYPE',
            400
        );
    }

    // 3. Validate MIME type is allowed for this purpose
    if (!isMimeAllowedForPurpose(mimeType, purpose)) {
        throw new PresignError(
            `MIME type '${mimeType}' is not allowed for purpose '${purpose}'`,
            'MIME_PURPOSE_MISMATCH',
            400
        );
    }

    // 4. Validate file size
    if (!isFileSizeAllowed(fileSize, purpose)) {
        const maxSize = getMaxSizeForPurpose(purpose);
        const maxSizeMB = Math.round(maxSize / (1024 * 1024));
        throw new PresignError(
            `File size ${Math.round(fileSize / (1024 * 1024))}MB exceeds maximum ${maxSizeMB}MB for purpose '${purpose}'`,
            'FILE_TOO_LARGE',
            400
        );
    }

    // 5. Check permissions (may throw PermissionError)
    await checkUploadPermission({
        user,
        entityType,
        entityId,
        purpose,
    });

    // 6. Generate S3 key
    const { key } = generateFileKey({
        entityType,
        entityId,
        purpose,
        mimeType,
    });

    // 7. Create pre-signed PUT URL
    const command = new PutObjectCommand({
        Bucket: s3Config.bucket,
        Key: key,
        ContentType: mimeType,
        ContentLength: fileSize,
    });

    const expiresIn = s3Config.presignExpirySeconds;

    const uploadUrl = await getSignedUrl(s3Client, command, {
        expiresIn,
    });

    // 8. Build public URL (CDN-friendly)
    const fileUrl = s3Config.cdnBaseUrl
        ? buildPublicUrl(key, s3Config.cdnBaseUrl)
        : `https://${s3Config.bucket}.s3.${s3Config.region}.amazonaws.com/${key}`;

    return {
        uploadUrl,
        fileUrl,
        key,
        expiresIn,
    };
}
