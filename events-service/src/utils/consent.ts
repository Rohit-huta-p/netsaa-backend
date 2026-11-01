import { Request } from 'express';
import UserConsent from '../models/UserConsent';

/**
 * DPDP consent persistence for event registration (gap §6a-f).
 *
 * Scope 'event_registration' = the attendee consents to NETSA sharing their
 * name/phone with the event host (the roster shows phone per DPDP A4). Today
 * this is client-only (`registerFlowStore.dpdpConsentAt`); here it travels with
 * /register and /reserve so there is an auditable record.
 */

// Bump when the consent copy shown at registration changes. Stored on each record
// so a later policy revision creates a fresh, separately-audited acceptance.
export const DPDP_POLICY_VERSION = '2026.1';
const SCOPE = 'event_registration' as const;

export interface ConsentSignal {
  accepted: boolean;
  version?: string;
  ipAddress?: string;
  userAgent?: string;
}

/** Pull the consent signal + audit metadata from a register/reserve request. */
export function consentFromRequest(req: Request): ConsentSignal {
  const body: any = req.body || {};
  return {
    accepted: body.dpdpConsent === true || body.consent?.eventRegistration === true,
    version: typeof body.consentVersion === 'string' ? body.consentVersion : undefined,
    ipAddress: req.ip,
    userAgent: req.header('user-agent') || undefined,
  };
}

/**
 * Record a user's event-registration consent. Idempotent per (userId, version):
 * a repeat accept at the same policy version is a no-op; a new version writes a
 * fresh record (history retained). NON-FATAL by design — a consent-log failure
 * must never block the registration, so errors are swallowed here.
 */
export async function recordEventRegistrationConsent(
  userId: any,
  signal: Pick<ConsentSignal, 'version' | 'ipAddress' | 'userAgent'> = {},
): Promise<void> {
  if (!userId) return;
  const version = signal.version || DPDP_POLICY_VERSION;
  try {
    await UserConsent.findOneAndUpdate(
      { userId, scope: SCOPE, version },
      { $setOnInsert: { acceptedAt: new Date(), ipAddress: signal.ipAddress, userAgent: signal.userAgent } },
      { upsert: true, setDefaultsOnInsert: true },
    );
  } catch {
    /* non-fatal: consent logging must never block a registration */
  }
}
