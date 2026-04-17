import mongoose, { Schema, Document } from 'mongoose';

/**
 * Contract Model — NETSA Booking Agreements
 *
 * A contract is created when a hirer selects an artist for a gig.
 * It captures the terms, amount, payment structure, and signatures.
 *
 * Contract tiers (PRD v4 section 9.3):
 * - Quick (<Rs.10K): one-tap checkbox
 * - Standard (Rs.10K - Rs.1L): scrollable terms + checkbox
 * - Premium (>Rs.1L): full terms + OTP signature
 *
 * Terms are immutable snapshots. Amendments are append-only.
 */

export interface IContractTerms {
    gigTitle: string;
    dates: {
        start: Date;
        end?: Date;
    };
    location: {
        venue?: string;
        city: string;
        state?: string;
    };
    scopeOfWork: string;
    amount: number;
    paymentStructure: 'full' | 'advance_balance';
    platformFeeRate: number;
    platformFeeAmount: number;
    artistReceives: number;
    cancellationTerms?: string;
    /**
     * Custom T&C freeform field. Plain text only, max 2000 chars, sanitized on
     * write per PRD §8.3.1 Step 5 XSS defense. Included verbatim in contractHash
     * at first signature (tamper detection).
     */
    customTerms?: string;
}

/**
 * Signature record — captures one party's agreement to the contract at a point
 * in time. Ceremony audit events (scroll reached bottom, double-confirm tapped)
 * travel with the signature so disputes can verify "did they actually read?"
 */
export interface ISignature {
    signedAt: Date;
    deviceInfo?: string;
    ipAddress?: string;
    otpVerified?: boolean;
    /** Who signed. 'guardian' only appears when signing for a minor. */
    signerRole?: 'hirer' | 'artist' | 'lead' | 'sub_artist' | 'guardian';
    /** If this is a guardian signature, the minor's user ID. */
    coSignedForUserId?: mongoose.Types.ObjectId;
    /** Timestamp when signer reached the bottom of the scrollable terms. */
    scrollEndedAt?: Date;
    /** Timestamp when the double-confirm "Yes, sign & confirm" was tapped. */
    doubleConfirmedAt?: Date;
    /** Biometric challenge event (Phase 2 for Standard/Premium gigs). */
    biometricPassedAt?: Date;
}

export interface IAmendment {
    number: number;
    requestedBy: mongoose.Types.ObjectId;
    requestedAt: Date;
    changes: Record<string, any>;
    reason: string;
    status: 'pending' | 'accepted' | 'rejected';
    respondedAt?: Date;
    respondedBy?: mongoose.Types.ObjectId;
}

export interface IContract extends Document {
    schemaVersion: number;
    gigId: mongoose.Types.ObjectId;
    hirerId: mongoose.Types.ObjectId;
    artistId: mongoose.Types.ObjectId;
    tier: 'quick' | 'standard' | 'premium';
    status:
        | 'draft'
        | 'sent'
        | 'accepted'
        | 'active'
        | 'pending_guardian_cosign'   // artist signed but guardian hasn't (minor flow)
        | 'pending_artist_signature'  // hirer signed, artist hasn't
        | 'performed'
        | 'completed'
        | 'declined'
        | 'disputed'
        | 'cancelled'
        | 'breached';
    terms: IContractTerms;
    /**
     * Payment rail for this contract (MVP hybrid model, §8.3.2 Stage 2).
     * Captured when the hirer confirms hire. Can be switched before artist signs.
     */
    paymentMethod: 'on_platform' | 'off_platform';
    hirerSignature?: ISignature;
    artistSignature?: ISignature;
    /** Minor's guardian co-signature (required if artist.isMinor === true). */
    guardianSignature?: ISignature;
    amendments: IAmendment[];
    /**
     * SHA-256 hash of canonical-JSON(terms) — locked at first signature. Second
     * signature must verify hash matches what it's signing. Tampering produces
     * hash mismatch → reject.
     */
    contractHash?: string;
    /** Link to parent Gig contract when this is a sub-gig contract. */
    parentContractId?: mongoose.Types.ObjectId;
    /**
     * S3 URL of the rendered immutable contract PDF. Generated at status -> 'active'.
     * Regenerated on amendment acceptance (new version).
     */
    pdfUrl?: string;
    completedAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}

const ContractTermsSchema = new Schema<IContractTerms>({
    gigTitle: { type: String, required: true },
    dates: {
        start: { type: Date, required: true },
        end: { type: Date },
    },
    location: {
        venue: { type: String },
        city: { type: String, required: true },
        state: { type: String },
    },
    scopeOfWork: { type: String, required: true },
    amount: { type: Number, required: true, min: 0 },
    paymentStructure: {
        type: String,
        enum: ['full', 'advance_balance'],
        default: 'full',
    },
    platformFeeRate: { type: Number, required: true },
    platformFeeAmount: { type: Number, required: true },
    artistReceives: { type: Number, required: true },
    cancellationTerms: { type: String },
    // Custom T&C freeform field — plain text only, max 2000 chars.
    // Sanitization MUST happen at the DTO / controller layer before save.
    // Included in contractHash at first signature.
    customTerms: { type: String, maxlength: 2000 },
}, { _id: false });

const SignatureSchema = new Schema<ISignature>({
    signedAt: { type: Date, required: true },
    deviceInfo: { type: String, maxlength: 500 },
    ipAddress: { type: String, maxlength: 64 },
    otpVerified: { type: Boolean, default: false },
    signerRole: {
        type: String,
        enum: ['hirer', 'artist', 'lead', 'sub_artist', 'guardian'],
    },
    coSignedForUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    scrollEndedAt: { type: Date },
    doubleConfirmedAt: { type: Date },
    biometricPassedAt: { type: Date },
}, { _id: false });

const AmendmentSchema = new Schema<IAmendment>({
    number: { type: Number, required: true },
    requestedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    requestedAt: { type: Date, default: Date.now },
    changes: { type: Schema.Types.Mixed, required: true },
    reason: { type: String, required: true },
    status: {
        type: String,
        enum: ['pending', 'accepted', 'rejected'],
        default: 'pending',
    },
    respondedAt: { type: Date },
    respondedBy: { type: Schema.Types.ObjectId, ref: 'User' },
}, { _id: false });

const ContractSchema = new Schema<IContract>({
    schemaVersion: { type: Number, default: 1 },

    gigId: { type: Schema.Types.ObjectId, ref: 'Gig', required: true },
    hirerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    artistId: { type: Schema.Types.ObjectId, ref: 'User', required: true },

    tier: {
        type: String,
        enum: ['quick', 'standard', 'premium'],
        required: true,
    },
    status: {
        type: String,
        enum: [
            'draft',
            'sent',
            'accepted',
            'active',
            'pending_guardian_cosign',
            'pending_artist_signature',
            'performed',
            'completed',
            'declined',
            'disputed',
            'cancelled',
            'breached',
        ],
        default: 'draft',
        index: true,
    },

    terms: { type: ContractTermsSchema, required: true },

    // MVP hybrid payment (PRD §8.3.2 Stage 2). Selected at hire confirmation.
    paymentMethod: {
        type: String,
        enum: ['on_platform', 'off_platform'],
        required: true,
        default: 'on_platform',
    },

    hirerSignature: SignatureSchema,
    artistSignature: SignatureSchema,
    guardianSignature: SignatureSchema,
    amendments: [AmendmentSchema],

    contractHash: { type: String, maxlength: 128 },
    parentContractId: { type: Schema.Types.ObjectId, ref: 'Contract' },
    pdfUrl: { type: String, maxlength: 2048 },
    completedAt: { type: Date },
}, { timestamps: true });

ContractSchema.index({ gigId: 1 });
ContractSchema.index({ hirerId: 1, status: 1 });
ContractSchema.index({ artistId: 1, status: 1 });
ContractSchema.index({ status: 1, createdAt: -1 });
// Parent-child lookups for Sub-Gig dashboard
ContractSchema.index({ parentContractId: 1, status: 1 });
// "My Bookings" IA query (PRD §8.3.3)
ContractSchema.index({ hirerId: 1, 'terms.dates.start': 1, status: 1 });

export default mongoose.model<IContract>('Contract', ContractSchema);
