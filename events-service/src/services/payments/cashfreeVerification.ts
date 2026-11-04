// Cashfree Secure ID (VRS) verification — UPI VPA + bank account, real-time (sync).
// Separate API from PG/Easy Split: base `/verification`, x-api-version 2024-12-01, same creds.
// Used to verify an organizer's payout destination during onboarding (UPI-first → bank).
// Works in the Cashfree sandbox (test VPAs success@upi/invalid@upi, test bank accounts),
// so this is verifiable live today even though Easy Split vendor creation is deferred (KYC).
//
// Docs (confirmed 2026-11-04):
//  - UPI:  POST /verification/upi/penny-drop  { vpa, verification_id, name?, user_consent{} }
//  - Bank: POST /verification/bank-account/sync { bank_account, ifsc, name?, phone? }

import crypto from 'crypto';

const CF_ENV = (process.env.CASHFREE_ENV || 'sandbox').toLowerCase();
const VRS_BASE = CF_ENV === 'production' ? 'https://api.cashfree.com/verification' : 'https://sandbox.cashfree.com/verification';
const VRS_API_VERSION = process.env.CASHFREE_VRS_API_VERSION || '2024-12-01';
const DEV = process.env.CASHFREE_DEV_MODE === '1';

function creds(): { id: string; secret: string } {
  const id = process.env.CASHFREE_APP_ID;
  const secret = process.env.CASHFREE_SECRET_KEY;
  if (!id || !secret) throw new Error('CASHFREE_APP_ID / CASHFREE_SECRET_KEY not set');
  return { id, secret };
}

async function vrs(path: string, body: unknown): Promise<any> {
  const { id, secret } = creds();
  const res = await fetch(`${VRS_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-version': VRS_API_VERSION,
      'x-client-id': id,
      'x-client-secret': secret,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: any;
  try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
  if (!res.ok) {
    const err: any = new Error(json?.message || `Cashfree VRS POST ${path} failed (${res.status})`);
    err.status = res.status;
    err.code = json?.code;
    err.cashfree = json;
    throw err;
  }
  return json;
}

export type NameMatchResult =
  | 'DIRECT_MATCH' | 'GOOD_PARTIAL_MATCH' | 'MODERATE_PARTIAL_MATCH' | 'POOR_PARTIAL_MATCH' | 'NO_MATCH' | 'MATCH';

export interface VerificationResult {
  method: 'bank' | 'upi';
  /** Account exists / VPA is valid. */
  valid: boolean;
  /** Provider status code (ACCOUNT_IS_VALID, INVALID_ACCOUNT_FAIL, …) for display/audit. */
  statusCode?: string;
  /** Name the bank has on file. */
  nameAtBank?: string;
  /** 0–100 (parsed). Present only when a name was supplied. */
  nameMatchScore?: number;
  nameMatchResult?: NameMatchResult;
  bankName?: string;
  referenceId?: string;
}

/** DIRECT_MATCH / GOOD_PARTIAL_MATCH (or score ≥ 70) = good enough to proceed. */
export function isNameMatchAcceptable(r: VerificationResult): boolean {
  if (r.nameMatchResult) {
    return r.nameMatchResult === 'DIRECT_MATCH' || r.nameMatchResult === 'GOOD_PARTIAL_MATCH' || r.nameMatchResult === 'MATCH';
  }
  return typeof r.nameMatchScore === 'number' ? r.nameMatchScore >= 70 : true;
}

function num(v: unknown): number | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  const n = parseFloat(String(v));
  return Number.isNaN(n) ? undefined : n;
}

/** Verify a bank account (account number + IFSC) in real time via Secure ID penny-drop. */
export async function verifyBankAccount(input: { bankAccount: string; ifsc: string; name?: string }): Promise<VerificationResult> {
  if (DEV) {
    return { method: 'bank', valid: true, statusCode: 'ACCOUNT_IS_VALID', nameAtBank: input.name || 'DEV ACCOUNT', nameMatchScore: 100, nameMatchResult: 'DIRECT_MATCH', bankName: 'DEV BANK' };
  }
  const res = await vrs('/bank-account/sync', {
    bank_account: input.bankAccount,
    ifsc: input.ifsc,
    ...(input.name ? { name: input.name } : {}),
  });
  return {
    method: 'bank',
    valid: String(res.account_status).toUpperCase() === 'VALID',
    statusCode: res.account_status_code,
    nameAtBank: res.name_at_bank,
    nameMatchScore: num(res.name_match_score),
    nameMatchResult: res.name_match_result,
    bankName: res.bank_name,
    referenceId: res.reference_id != null ? String(res.reference_id) : undefined,
  };
}

/** Verify a UPI VPA in real time via Secure ID. Requires explicit user consent (built here). */
export async function verifyVpa(input: { vpa: string; name?: string; verificationId?: string }): Promise<VerificationResult> {
  if (DEV) {
    const invalid = /invalid|expired/i.test(input.vpa);
    return { method: 'upi', valid: !invalid, statusCode: invalid ? 'INVALID' : 'VALID', nameAtBank: invalid ? undefined : (input.name || 'DEV ACCOUNT'), nameMatchScore: invalid ? undefined : 100, nameMatchResult: invalid ? 'NO_MATCH' : 'DIRECT_MATCH' };
  }
  const res = await vrs('/upi/penny-drop', {
    vpa: input.vpa,
    verification_id: (input.verificationId || `netsa_${crypto.randomBytes(10).toString('hex')}`).slice(0, 50),
    ...(input.name ? { name: input.name } : {}),
    user_consent: {
      obtained: true,
      type: 'EXPLICIT',
      timestamp: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
      purpose: 'Payout account verification for NETSA event organizer',
    },
  });
  const status = String(res.status).toUpperCase();
  return {
    method: 'upi',
    valid: status === 'VALID' || status === 'SUCCESS',
    statusCode: res.status,
    nameAtBank: res.name_at_bank,
    nameMatchScore: num(res.name_match_score),
    nameMatchResult: res.name_match_result,
    bankName: res.ifsc_details?.bank,
    referenceId: res.reference_id != null ? String(res.reference_id) : undefined,
  };
}
