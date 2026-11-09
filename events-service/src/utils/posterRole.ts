/**
 * Whether an event host counts as a "Creative Lead" for follower notifications.
 *
 * The Follow feature notifies followers only when a Creative Lead publishes.
 * A client- or artist-hosted event does not fan out — even if that host still
 * has followers from a past CL stint, since roles are reversible (chosen at
 * signup, changeable in Settings).
 *
 * 'organizer' is the legacy pre-2026-06 virtual role that maps forward to
 * creative_lead (mirrors gigs-service roleVisibility.normalizeRole).
 */
export function isCreativeLeadRole(role?: string): boolean {
    return role === 'creative_lead' || role === 'organizer';
}
