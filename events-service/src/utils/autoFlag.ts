/**
 * Auto-flag patterns for user-generated content. Applied to:
 *  - Event.title, Event.tagline, Event.about, Event.whatToExpect
 *  - EventComment.body
 *
 * Triggers on submit. Sets status='pending_review' for admin moderation.
 * Tighten patterns based on production false-positive rate.
 */

export const AUTO_FLAG_PATTERNS = {
    external_payment: /\b(upi|paytm|gpay|phonepe|venmo|paypal|bank account|ifsc|a\/c|account number)\b/i,
    contact_in_field: /\b(\+?91[\s-]?[6-9]\d{9}|[6-9]\d{9})\b|\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/i,
    off_platform: /\b(dm me|whatsapp me|message me on|contact me at|instagram|telegram|signal)\b/i,
    url: /https?:\/\/|www\./i,
} as const;

export type AutoFlagReason = keyof typeof AUTO_FLAG_PATTERNS;

export interface AutoFlagResult {
    flagged: boolean;
    reasons: AutoFlagReason[];
}

export function checkAutoFlag(text: string): AutoFlagResult {
    const reasons: AutoFlagReason[] = [];

    for (const [reason, pattern] of Object.entries(AUTO_FLAG_PATTERNS)) {
        if (pattern.test(text)) {
            reasons.push(reason as AutoFlagReason);
        }
    }

    return { flagged: reasons.length > 0, reasons };
}

/**
 * Composite check across multiple fields. Returns first reason or null.
 * Used by event publish flow to set moderationFlagReason.
 */
export function checkEventContent(fields: {
    title?: string;
    tagline?: string;
    about?: string;
    whatToExpect?: string;
}): AutoFlagResult {
    const allText = [fields.title, fields.tagline, fields.about, fields.whatToExpect]
        .filter(Boolean)
        .join(' ');
    return checkAutoFlag(allText);
}
