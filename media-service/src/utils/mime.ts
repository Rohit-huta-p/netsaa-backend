// ============================================================
// MIME Type Utilities
// ============================================================

export type FileType = 'image' | 'video' | 'document';

export interface MimeConfig {
    mimeType: string;
    extension: string;
    fileType: FileType;
    maxSizeBytes: number;
}

// ============================================================
// ALLOWED MIME TYPES
// ============================================================

const MIME_CONFIGS: MimeConfig[] = [
    // Images
    { mimeType: 'image/jpeg', extension: 'jpg', fileType: 'image', maxSizeBytes: 10 * 1024 * 1024 },
    { mimeType: 'image/png', extension: 'png', fileType: 'image', maxSizeBytes: 10 * 1024 * 1024 },
    { mimeType: 'image/webp', extension: 'webp', fileType: 'image', maxSizeBytes: 10 * 1024 * 1024 },
    { mimeType: 'image/gif', extension: 'gif', fileType: 'image', maxSizeBytes: 10 * 1024 * 1024 },

    // Videos
    { mimeType: 'video/mp4', extension: 'mp4', fileType: 'video', maxSizeBytes: 100 * 1024 * 1024 },
    { mimeType: 'video/quicktime', extension: 'mov', fileType: 'video', maxSizeBytes: 100 * 1024 * 1024 },

    // Documents
    { mimeType: 'application/pdf', extension: 'pdf', fileType: 'document', maxSizeBytes: 20 * 1024 * 1024 },
];

// ============================================================
// LOOKUP MAPS
// ============================================================

const MIME_TO_CONFIG = new Map<string, MimeConfig>(
    MIME_CONFIGS.map(config => [config.mimeType, config])
);

const ALLOWED_MIME_TYPES = new Set(MIME_CONFIGS.map(c => c.mimeType));

// ============================================================
// PURPOSE-SPECIFIC MIME RESTRICTIONS
// ============================================================

export type Purpose =
    | 'avatar'
    | 'portfolio'
    | 'audition'
    | 'banner'
    | 'gallery'
    | 'thumbnail'
    | 'promo'
    | 'documents';

const PURPOSE_ALLOWED_MIMES: Record<Purpose, string[]> = {
    avatar: ['image/jpeg', 'image/png', 'image/webp'],
    portfolio: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/quicktime'],
    audition: ['video/mp4', 'video/quicktime'],
    banner: ['image/jpeg', 'image/png', 'image/webp'],
    gallery: ['image/jpeg', 'image/png', 'image/webp', 'video/mp4'],
    thumbnail: ['image/jpeg', 'image/png', 'image/webp'],
    promo: ['video/mp4', 'video/quicktime'],
    documents: ['application/pdf'],
};

const PURPOSE_MAX_SIZE: Record<Purpose, number> = {
    avatar: 5 * 1024 * 1024,       // 5 MB
    portfolio: 100 * 1024 * 1024,  // 100 MB (supports videos)
    audition: 100 * 1024 * 1024,   // 100 MB
    banner: 10 * 1024 * 1024,      // 10 MB
    gallery: 50 * 1024 * 1024,     // 50 MB
    thumbnail: 5 * 1024 * 1024,    // 5 MB
    promo: 100 * 1024 * 1024,      // 100 MB
    documents: 20 * 1024 * 1024,   // 20 MB
};

// ============================================================
// PUBLIC FUNCTIONS
// ============================================================

/**
 * Check if a MIME type is globally allowed.
 */
export function isAllowedMimeType(mimeType: string): boolean {
    return ALLOWED_MIME_TYPES.has(mimeType);
}

/**
 * Check if a MIME type is allowed for a specific purpose.
 */
export function isMimeAllowedForPurpose(mimeType: string, purpose: Purpose): boolean {
    const allowed = PURPOSE_ALLOWED_MIMES[purpose];
    return allowed ? allowed.includes(mimeType) : false;
}

/**
 * Get the file extension for a MIME type.
 */
export function getExtensionFromMime(mimeType: string): string | null {
    const config = MIME_TO_CONFIG.get(mimeType);
    return config ? config.extension : null;
}

/**
 * Get the max file size for a purpose.
 */
export function getMaxSizeForPurpose(purpose: Purpose): number {
    return PURPOSE_MAX_SIZE[purpose];
}

/**
 * Validate file size against purpose limit.
 */
export function isFileSizeAllowed(fileSize: number, purpose: Purpose): boolean {
    const maxSize = PURPOSE_MAX_SIZE[purpose];
    return fileSize <= maxSize;
}

/**
 * Get all allowed MIME types for a purpose.
 */
export function getAllowedMimesForPurpose(purpose: Purpose): string[] {
    return PURPOSE_ALLOWED_MIMES[purpose] || [];
}

/**
 * Get all globally allowed MIME types.
 */
export function getAllAllowedMimeTypes(): string[] {
    return Array.from(ALLOWED_MIME_TYPES);
}
