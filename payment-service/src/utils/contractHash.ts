/**
 * Contract tamper detection via canonical-JSON SHA-256 hash.
 *
 * The hash is computed over contract.terms at creation, then re-verified at
 * every signature step. If an attacker (or a bug) silently mutates terms
 * between create and sign, the recomputed hash diverges and the sign call
 * aborts with a tamper error.
 *
 * Why canonical JSON, not plain JSON.stringify:
 *   Plain stringify preserves object-property insertion order. Mongoose can
 *   reorder fields on hydration (schema vs. POJO), and any refactor that
 *   touches the terms object is a ticking false-positive. Sorting keys
 *   recursively makes the hash stable across every code path that produces
 *   the same logical terms.
 *
 * Scope: hashes *terms only*. paymentMethod is a rail selection tracked
 * separately (the switchPaymentMethod endpoint changes it without a hash
 * re-compute). Signatures live on the contract doc, not in the hash.
 */

import crypto from 'crypto';

/** Recursively stringify with sorted keys so the output is order-independent. */
export function canonicalStringify(value: any): string {
    if (value === null || typeof value !== 'object') {
        return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
        return '[' + value.map(canonicalStringify).join(',') + ']';
    }
    if (value instanceof Date) {
        return JSON.stringify(value.toISOString());
    }
    const keys = Object.keys(value).sort();
    const parts = keys.map((k) => JSON.stringify(k) + ':' + canonicalStringify(value[k]));
    return '{' + parts.join(',') + '}';
}

/**
 * SHA-256 hex digest of the canonical-JSON encoding of `terms`.
 * Use the same function at create-time and verify-time.
 */
export function computeContractHash(terms: unknown): string {
    return crypto.createHash('sha256').update(canonicalStringify(terms)).digest('hex');
}
