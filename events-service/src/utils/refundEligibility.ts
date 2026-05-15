export type RefundPolicy = 'flex_24h' | 'firm' | 'custom';

export interface EventPricing {
    refundPolicy?: RefundPolicy;
    refundCustomNote?: string;
}

/**
 * Returns:
 *   - true  → automatic refund allowed
 *   - false → no refund (firm policy or window passed)
 *   - null  → custom policy — organizer must decide manually
 */
export function isRefundEligible(pricing: EventPricing, eventStartsAt: Date | string): boolean | null {
    const policy = pricing.refundPolicy ?? 'flex_24h';

    if (policy === 'firm') return false;
    if (policy === 'custom') return null;

    // flex_24h: refund if more than 24h until event start
    const startMs = typeof eventStartsAt === 'string' ? new Date(eventStartsAt).getTime() : eventStartsAt.getTime();
    const hoursUntil = (startMs - Date.now()) / 3600_000;
    return hoursUntil > 24;
}

/**
 * Compute the actual refund amount in rupees. Today only full-or-zero refunds.
 * Future: partial refund tiers (>7d = 100%, 24h-7d = 50%, <24h = 0%).
 */
export function computeRefundAmount(
    pricing: EventPricing,
    eventStartsAt: Date | string,
    paidAmountInRupees: number,
): number {
    const eligible = isRefundEligible(pricing, eventStartsAt);
    if (eligible === true) return paidAmountInRupees;
    return 0;
}
