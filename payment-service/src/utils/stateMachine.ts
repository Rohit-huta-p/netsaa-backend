/**
 * State Machine for Transactions and Contracts
 * From System Design v2 (lines 521-542)
 *
 * Validates that a status transition is legal.
 * Throws an error on invalid transition.
 */

export type TransactionStatus = 'created' | 'paid' | 'confirmed' | 'completed' | 'disputed' | 'refunded' | 'failed';
export type OfflineStatus = 'recorded' | 'confirmed' | 'disputed' | 'expired' | 'completed';
export type ContractStatus =
    | 'draft'
    | 'sent'
    | 'accepted'
    | 'active'
    | 'pending_guardian_cosign'
    | 'pending_artist_signature'
    | 'performed'
    | 'completed'
    | 'declined'
    | 'disputed'
    | 'cancelled'
    | 'breached';

// On-platform transaction transitions
const TRANSACTION_TRANSITIONS: Record<string, string[]> = {
    created: ['paid', 'failed'],
    paid: ['confirmed', 'disputed'],
    confirmed: ['completed'],
    disputed: ['completed', 'refunded'],
    failed: ['created'], // retry
};

// Offline transaction transitions
const OFFLINE_TRANSITIONS: Record<string, string[]> = {
    recorded: ['confirmed', 'disputed', 'expired'],
    confirmed: ['completed'],
    disputed: ['confirmed', 'completed'],
};

// Contract lifecycle transitions
// Age-gate paths (PRD v4 §8.3.2 / Indian Contract Act §11):
//   - Minor artist signs → pending_guardian_cosign (guardian must confirm)
//   - Guardian confirms → accepted
//   - Guardian rejects → declined
// Hirer-first / artist-first flexibility:
//   - 'sent' → 'pending_artist_signature' covers the hirer-signed-first flow when
//     the artist hasn't countersigned yet (UX reveals artist CTA).
const CONTRACT_TRANSITIONS: Record<string, string[]> = {
    draft: ['sent', 'cancelled'],
    sent: ['accepted', 'declined', 'pending_guardian_cosign', 'pending_artist_signature', 'cancelled'],
    pending_artist_signature: ['accepted', 'declined', 'pending_guardian_cosign', 'cancelled'],
    pending_guardian_cosign: ['accepted', 'declined', 'cancelled'],
    accepted: ['active', 'cancelled'],
    active: ['performed', 'disputed', 'cancelled'],
    performed: ['completed'],
    disputed: ['completed', 'breached'],
};

export function validateTransition(
    current: string,
    next: string,
    type: 'transaction' | 'offline' | 'contract'
): boolean {
    const map = type === 'transaction'
        ? TRANSACTION_TRANSITIONS
        : type === 'offline'
            ? OFFLINE_TRANSITIONS
            : CONTRACT_TRANSITIONS;

    const allowed = map[current];
    if (!allowed) {
        throw new Error(`Invalid current status: ${current} for type: ${type}`);
    }
    if (!allowed.includes(next)) {
        throw new Error(`Invalid transition: ${current} -> ${next} for type: ${type}. Allowed: ${allowed.join(', ')}`);
    }
    return true;
}
