import { v4 as uuidv4 } from 'uuid';
import { getExtensionFromMime, Purpose } from './mime';

// ============================================================
// TYPES
// ============================================================

export type EntityType = 'user' | 'artist' | 'gig' | 'event' | 'contract';

export interface FileKeyParams {
    entityType: EntityType;
    entityId: string;
    purpose: Purpose;
    mimeType: string;
}

export interface GeneratedFileKey {
    key: string;
    folder: string;
    filename: string;
}

// ============================================================
// ENTITY TO ROOT FOLDER MAPPING
// ============================================================

const ENTITY_TO_ROOT: Record<EntityType, string> = {
    user: 'users',
    artist: 'artists',
    gig: 'gigs',
    event: 'events',
    contract: 'contracts',
};

// ============================================================
// KEY GENERATOR
// ============================================================

/**
 * Generates a canonical S3 object key.
 * 
 * Format: <entityType>s/<entityId>/<purpose>/<uuid>.<ext>
 * 
 * Example: artists/507f1f77bcf86cd799439011/avatar/550e8400-e29b-41d4-a716-446655440000.jpg
 * 
 * SECURITY: Client-provided filenames are NEVER accepted or used.
 * Keys are derived ONLY from entity context + server-generated UUID.
 * This is a LOCKED architectural decision - do not modify.
 * 
 * @throws Error if MIME type is not recognized
 */
export function generateFileKey(params: FileKeyParams): GeneratedFileKey {
    const { entityType, entityId, purpose, mimeType } = params;

    // Get extension from MIME type
    const extension = getExtensionFromMime(mimeType);
    if (!extension) {
        throw new Error(`Unrecognized MIME type: ${mimeType}`);
    }

    // Generate UUID filename
    const uuid = uuidv4();
    const filename = `${uuid}.${extension}`;

    // Build folder path
    const root = ENTITY_TO_ROOT[entityType];
    const folder = `${root}/${entityId}/${purpose}`;

    // Build full key
    const key = `${folder}/${filename}`;

    return { key, folder, filename };
}

/**
 * Generates the public CDN URL from an S3 key.
 */
export function buildPublicUrl(key: string, cdnBaseUrl: string): string {
    const baseUrl = cdnBaseUrl.replace(/\/$/, '');
    return `${baseUrl}/${key}`;
}

/**
 * Generates the delete prefix for bulk deletion.
 * Used when deleting all media for an entity.
 * 
 * Example: getDeletePrefix('gig', '60d5ec9af682fbd12a892c41') 
 *          => 'gigs/60d5ec9af682fbd12a892c41/'
 */
export function getDeletePrefix(entityType: EntityType, entityId: string): string {
    const root = ENTITY_TO_ROOT[entityType];
    return `${root}/${entityId}/`;
}

/**
 * Validate that an entity ID looks like a MongoDB ObjectId.
 */
export function isValidObjectId(id: string): boolean {
    return /^[a-fA-F0-9]{24}$/.test(id);
}
