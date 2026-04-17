/**
 * Fee Calculation Service
 *
 * Fee rates are config-driven via `PAYMENT_PHASE` env var (default: 'mvp').
 * Rates are read once at module load — restart the process to apply env changes.
 *
 * ## Phase switch
 * - `mvp`    — 0% everywhere. Razorpay Route routes 100% to artist. No platform cut.
 *              Activation criteria for Phase 2 are tracked separately (PRD §9.2.1).
 * - `phase2` — Live rates: 12% gig, 10% event, 8% sub-artist, 10% verified override.
 *
 * Individual rate env var overrides (useful for emergency hotfixes without code deploy):
 *   FEE_RATE_GIG_MVP, FEE_RATE_GIG_PHASE2
 *   FEE_RATE_EVENT_MVP, FEE_RATE_EVENT_PHASE2
 *   FEE_RATE_SUBARTIST_MVP, FEE_RATE_SUBARTIST_PHASE2
 *   FEE_RATE_VERIFIED_OVERRIDE_PHASE2
 *
 * Reference: NETSA_PRD_v4.md §9.2.1, NETSA_PaymentService_Reconciliation.md
 */

export type TransactionType = 'gig_payment' | 'event_ticket' | 'sub_artist' | 'offline_record';
export type TrustTier = 'new' | 'rising' | 'trusted' | 'verified';
export type PaymentPhase = 'mvp' | 'phase2';

/**
 * Transaction status union — mirrors the status enum on the Transaction model.
 * Kept as a primitive string union so this utility has no mongoose coupling.
 */
export type TransactionStatus =
    | 'created'
    | 'recorded'
    | 'paid'
    | 'confirmed'
    | 'completed'
    | 'disputed'
    | 'reopened'
    | 'refunded'
    | 'failed'
    | 'expired';

export type OffPlatformOrOn = 'on_platform' | 'off_platform';

interface FeeResult {
    rate: number;
    platformFee: number;
    artistReceives: number;
}

// ---------------------------------------------------------------------------
// Config layer — read at module load, cached for process lifetime
// ---------------------------------------------------------------------------

/**
 * Parse a numeric rate from an env var. Falls back to `defaultRate` on missing
 * or non-numeric values; logs a warning if the value was present but invalid.
 */
function parseRateEnv(envKey: string, defaultRate: number): number {
    const raw = process.env[envKey];
    if (raw === undefined || raw === '') return defaultRate;
    const parsed = parseFloat(raw);
    if (!isNaN(parsed) && parsed >= 0 && parsed < 0.5) return parsed;
    console.warn(
        `[fee.service] env var "${envKey}" value "${raw}" out of bounds [0, 0.5); using default ${defaultRate}`
    );
    return defaultRate;
}

/**
 * Per-phase fee schedule. Each rate can be overridden via env var.
 * Structure: FEE_CONFIG[phase][transactionType]
 */
const FEE_CONFIG: Record<PaymentPhase, Record<TransactionType, number>> = {
    mvp: {
        gig_payment:    parseRateEnv('FEE_RATE_GIG_MVP', 0),
        event_ticket:   parseRateEnv('FEE_RATE_EVENT_MVP', 0),
        sub_artist:     parseRateEnv('FEE_RATE_SUBARTIST_MVP', 0),
        offline_record: 0, // Always 0 — platform never touches offline money
    },
    phase2: {
        gig_payment:    parseRateEnv('FEE_RATE_GIG_PHASE2', 0.12),
        event_ticket:   parseRateEnv('FEE_RATE_EVENT_PHASE2', 0.10),
        sub_artist:     parseRateEnv('FEE_RATE_SUBARTIST_PHASE2', 0.08),
        offline_record: 0, // Always 0 — platform never touches offline money
    },
};

/**
 * Verified-tier override for gig_payment in Phase 2 only.
 * In MVP, everything is 0% anyway, so this override is a no-op.
 */
const VERIFIED_OVERRIDE_PHASE2: number = parseRateEnv('FEE_RATE_VERIFIED_OVERRIDE_PHASE2', 0.10);

/**
 * Active phase, resolved once at startup.
 * Invalid values fall back to 'mvp' with a warning.
 */
function resolvePhase(): PaymentPhase {
    const raw = process.env['PAYMENT_PHASE'];
    if (raw === undefined || raw === '') return 'mvp';
    if (raw === 'mvp' || raw === 'phase2') return raw;
    console.warn(
        `[fee.service] Invalid PAYMENT_PHASE: "${raw}". ` +
        `Expected "mvp" or "phase2". Falling back to "mvp".`
    );
    return 'mvp';
}

const ACTIVE_PHASE: PaymentPhase = resolvePhase();

console.log('[fee.service] initialized', {
    phase: ACTIVE_PHASE,
    rates: FEE_CONFIG[ACTIVE_PHASE],
    verifiedTierOverride: ACTIVE_PHASE === 'phase2' ? VERIFIED_OVERRIDE_PHASE2 : null,
});

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns the payment phase currently active for this process.
 * Flip via `PAYMENT_PHASE` env var — requires process restart to take effect.
 */
export function getCurrentPhase(): PaymentPhase {
    return ACTIVE_PHASE;
}

/**
 * Returns the effective fee rate for a given transaction type and trust tier,
 * using the currently active phase config.
 *
 * @param type - Transaction type
 * @param tier - Artist's trust tier (used only for verified override on gig_payment in phase2)
 */
export function getFeeRate(type: TransactionType, tier: TrustTier = 'new'): number {
    if (type === 'offline_record') return 0;

    let rate = FEE_CONFIG[ACTIVE_PHASE][type];

    // Verified tier gets a reduced rate on gig_payment in Phase 2.
    // In MVP all rates are 0 so this override is a no-op (correct behaviour).
    if (ACTIVE_PHASE === 'phase2' && tier === 'verified' && type === 'gig_payment') {
        rate = VERIFIED_OVERRIDE_PHASE2;
    }

    return rate;
}

/**
 * Calculate platform fees for a transaction.
 *
 * Signature is unchanged from the original implementation — all existing
 * callers (contract.controller.ts, transaction.controller.ts) continue to work.
 *
 * @param amount - Total amount in INR (not paise)
 * @param type - Transaction type
 * @param artistTrustTier - Artist's current trust tier (affects fee for verified artists)
 * @returns Fee breakdown: effective rate, platform fee, and artist net amount
 */
export function calculateFees(
    amount: number,
    type: TransactionType,
    artistTrustTier: TrustTier = 'new'
): FeeResult {
    if (type === 'offline_record') {
        return { rate: 0, platformFee: 0, artistReceives: amount };
    }

    const rate = getFeeRate(type, artistTrustTier);
    const platformFee = Math.round(amount * rate * 100) / 100; // Round to 2 decimals
    const artistReceives = amount - platformFee;

    return { rate, platformFee, artistReceives };
}

/**
 * Check if a user is eligible for 30/70 advance/balance split.
 * Gated behind Trust >= 51 (Trusted tier) or 2+ completed on-platform payments.
 *
 * Unchanged from original implementation.
 */
export function isEligibleFor3070(trustScore: number, completedPayments: number): boolean {
    return trustScore >= 51 || completedPayments >= 2;
}

/**
 * Compute the Trust Engine signal multiplier for a given payment interaction.
 *
 * This value is written to `Transaction.trustWeight` at finalization time so
 * the Trust Engine can read pre-computed weights without recalculating.
 *
 * ## Weighting table (PRD §9.2.1)
 * | paymentType    | status                    | weight |
 * |----------------|---------------------------|--------|
 * | on_platform    | confirmed \| completed    | 1.0    |
 * | off_platform   | confirmed \| completed    | 0.7    |
 * | any            | disputed                  | -1.0   |
 * | any            | all other statuses        | 0      |
 *
 * Statuses that return 0 (not yet counted):
 * `created`, `recorded`, `paid`, `failed`, `expired`, `reopened`, `refunded`
 *
 * @param paymentType - Whether the payment was processed on-platform (Razorpay Route) or off-platform (UPI/cash recording)
 * @param status      - Current transaction status from the Transaction model
 * @returns Multiplier: 1.0 | 0.7 | -1.0 | 0
 */
export function computeTrustWeight(
    paymentType: OffPlatformOrOn,
    status: TransactionStatus
): number {
    // Disputes are a penalty regardless of payment path
    if (status === 'disputed') return -1.0;

    // Only count finalized positive states
    if (status === 'confirmed' || status === 'completed') {
        return paymentType === 'on_platform' ? 1.0 : 0.7;
    }

    // created | recorded | paid | failed | expired | reopened | refunded → not yet counted
    return 0;
}
