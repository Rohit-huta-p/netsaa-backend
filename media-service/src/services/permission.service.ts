import mongoose from 'mongoose';
import { UserRole, AuthUser } from '../middleware/auth';
import { EntityType } from '../utils/fileKey';
import { Purpose } from '../utils/mime';

// ============================================================
// ERRORS
// ============================================================

export class PermissionError extends Error {
    constructor(
        message: string,
        public code: 'FORBIDDEN' | 'NOT_FOUND' | 'INVALID_PURPOSE',
        public statusCode: number = 403
    ) {
        super(message);
        this.name = 'PermissionError';
    }
}

// ============================================================
// PURPOSE-ENTITY VALIDATION MATRIX
// ============================================================

const PURPOSE_ENTITY_MATRIX: Record<Purpose, EntityType[]> = {
    avatar: ['user', 'artist'],
    portfolio: ['user', 'artist'],
    audition: ['artist'],
    banner: ['gig'],
    gallery: ['user', 'gig', 'event'],
    thumbnail: ['event'],
    promo: ['event'],
    documents: ['contract'],
};

// ============================================================
// MONGOOSE MODELS (Lazy loaded to avoid circular deps)
// ============================================================

// These are imported dynamically to read from existing collections
// Media-service has READ-ONLY access to these collections

interface IGig {
    _id: mongoose.Types.ObjectId;
    organizerId: mongoose.Types.ObjectId;
}

interface IEvent {
    _id: mongoose.Types.ObjectId;
    organizerId: mongoose.Types.ObjectId;
}

interface IContract {
    _id: mongoose.Types.ObjectId;
    organizerId: mongoose.Types.ObjectId;
    artistId: mongoose.Types.ObjectId;
}

interface IArtist {
    _id: mongoose.Types.ObjectId;
    userId: mongoose.Types.ObjectId;
}

// Model schemas for read-only access
const GigSchema = new mongoose.Schema({
    organizerId: { type: mongoose.Schema.Types.ObjectId, required: true },
}, { collection: 'gigs', strict: false });

const EventSchema = new mongoose.Schema({
    organizerId: { type: mongoose.Schema.Types.ObjectId, required: true },
}, { collection: 'events', strict: false });

const ContractSchema = new mongoose.Schema({
    organizerId: { type: mongoose.Schema.Types.ObjectId, required: true },
    artistId: { type: mongoose.Schema.Types.ObjectId, required: true },
}, { collection: 'contracts', strict: false });

const ArtistSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, required: true },
}, { collection: 'artists', strict: false });

// Lazy model getters to prevent re-registration
function getGigModel() {
    return mongoose.models.Gig || mongoose.model<IGig>('Gig', GigSchema);
}

function getEventModel() {
    return mongoose.models.Event || mongoose.model<IEvent>('Event', EventSchema);
}

function getContractModel() {
    return mongoose.models.Contract || mongoose.model<IContract>('Contract', ContractSchema);
}

function getArtistModel() {
    return mongoose.models.Artist || mongoose.model<IArtist>('Artist', ArtistSchema);
}

// ============================================================
// PERMISSION SERVICE
// ============================================================

export interface PermissionCheckParams {
    user: AuthUser;
    entityType: EntityType;
    entityId: string;
    purpose: Purpose;
}

export interface PermissionResult {
    allowed: boolean;
    reason?: string;
}

/**
 * Validates whether the authenticated user can upload media for the given entity.
 * 
 * @throws PermissionError if validation fails
 */
export async function checkUploadPermission(params: PermissionCheckParams): Promise<void> {
    const { user, entityType, entityId, purpose } = params;

    // 1. Admin bypass
    if (user.role === 'admin') {
        return;
    }

    // 2. Validate purpose is allowed for entity type
    const allowedEntities = PURPOSE_ENTITY_MATRIX[purpose];
    if (!allowedEntities || !allowedEntities.includes(entityType)) {
        throw new PermissionError(
            `Purpose '${purpose}' is not allowed for entity type '${entityType}'`,
            'INVALID_PURPOSE',
            400
        );
    }

    // 3. Check ownership based on entity type
    switch (entityType) {
        case 'user':
            await checkUserOwnership(user, entityId);
            break;
        case 'artist':
            await checkArtistOwnership(user, entityId);
            break;
        case 'gig':
            await checkGigOwnership(user, entityId);
            break;
        case 'event':
            await checkEventOwnership(user, entityId);
            break;
        case 'contract':
            await checkContractOwnership(user, entityId);
            break;
        default:
            throw new PermissionError(
                `Unknown entity type: ${entityType}`,
                'FORBIDDEN',
                400
            );
    }
}

/**
 * User upload: userId must match entityId.
 */
async function checkUserOwnership(user: AuthUser, entityId: string): Promise<void> {
    if (user.id !== entityId) {
        throw new PermissionError(
            'You can only upload media for your own user profile',
            'FORBIDDEN',
            403
        );
    }
}

/**
 * Artist upload: artist.userId must match user.id
 */
async function checkArtistOwnership(user: AuthUser, entityId: string): Promise<void> {
    const Artist = getArtistModel();

    const artist = await Artist.findById(entityId).select('userId').lean() as { userId: mongoose.Types.ObjectId } | null;

    if (!artist) {
        throw new PermissionError(
            `Artist with ID '${entityId}' not found`,
            'NOT_FOUND',
            404
        );
    }

    if (artist.userId.toString() !== user.id) {
        throw new PermissionError(
            'You can only upload media for your own artist profile',
            'FORBIDDEN',
            403
        );
    }
}

/**
 * Gig upload: gig.organizerId must match user.id
 */
async function checkGigOwnership(user: AuthUser, entityId: string): Promise<void> {
    if (user.role !== 'organizer' && user.role !== 'admin') {
        throw new PermissionError(
            'Only organizers can upload gig media',
            'FORBIDDEN',
            403
        );
    }

    const Gig = getGigModel();

    const gig = await Gig.findById(entityId).select('organizerId').lean() as { organizerId: mongoose.Types.ObjectId } | null;

    if (!gig) {
        throw new PermissionError(
            `Gig with ID '${entityId}' not found`,
            'NOT_FOUND',
            404
        );
    }

    if (gig.organizerId.toString() !== user.id) {
        throw new PermissionError(
            'You can only upload media for gigs you own',
            'FORBIDDEN',
            403
        );
    }
}

/**
 * Event upload: event.organizerId must match user.id
 */
async function checkEventOwnership(user: AuthUser, entityId: string): Promise<void> {
    if (user.role !== 'organizer' && user.role !== 'admin') {
        throw new PermissionError(
            'Only organizers can upload event media',
            'FORBIDDEN',
            403
        );
    }

    const Event = getEventModel();

    const event = await Event.findById(entityId).select('organizerId').lean() as { organizerId: mongoose.Types.ObjectId } | null;

    if (!event) {
        throw new PermissionError(
            `Event with ID '${entityId}' not found`,
            'NOT_FOUND',
            404
        );
    }

    if (event.organizerId.toString() !== user.id) {
        throw new PermissionError(
            'You can only upload media for events you own',
            'FORBIDDEN',
            403
        );
    }
}

/**
 * Contract upload: only admin or owning organizer.
 */
async function checkContractOwnership(user: AuthUser, entityId: string): Promise<void> {
    // Only organizers and admins can upload contract documents
    if (user.role !== 'organizer' && user.role !== 'admin') {
        throw new PermissionError(
            'Only organizers can upload contract documents',
            'FORBIDDEN',
            403
        );
    }

    const Contract = getContractModel();

    const contract = await Contract.findById(entityId).select('organizerId artistId').lean() as { organizerId: mongoose.Types.ObjectId; artistId: mongoose.Types.ObjectId } | null;

    if (!contract) {
        throw new PermissionError(
            `Contract with ID '${entityId}' not found`,
            'NOT_FOUND',
            404
        );
    }

    // Check if user is the organizer on this contract
    if (contract.organizerId.toString() !== user.id) {
        throw new PermissionError(
            'You can only upload documents for contracts you own',
            'FORBIDDEN',
            403
        );
    }
}

/**
 * Validate that purpose is allowed for entity type.
 */
export function validatePurposeForEntity(entityType: EntityType, purpose: Purpose): boolean {
    const allowedEntities = PURPOSE_ENTITY_MATRIX[purpose];
    return allowedEntities ? allowedEntities.includes(entityType) : false;
}
