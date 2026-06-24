/**
 * Input sanitization helpers — defenses against stored XSS + PDF injection.
 *
 * Policy (PRD v4 §8.3.1 Step 5):
 *   - Plain text only for user-supplied contract fields (T&C, notes, reasons).
 *   - No HTML tags, no javascript:/data:/vbscript: URIs, no event handlers.
 *   - Reject control characters (except LF). Reject null bytes.
 *   - Normalize Unicode to NFC. Strip zero-width chars.
 *   - Enforce length limit at call site.
 *
 * When T&C content flows into server-side PDF rendering (via PDFKit or similar),
 * ANY bypass here becomes a rendering attack. Defense-in-depth: PDF template
 * must also render as plaintext with no URL auto-detection.
 */

const CONTROL_CHARS_EXCEPT_LF = /[\x00-\x09\x0B-\x1F\x7F]/g;
const ZERO_WIDTH_CHARS = /[\u200B\u200C\u200D\uFEFF]/g;
const HTML_TAG = /<\/?[a-zA-Z][^>]*>/g;
const DANGEROUS_URI_SCHEMES = /\b(javascript|data|vbscript|file):/gi;
const EVENT_HANDLER = /\bon[a-z]+\s*=/gi;
const MARKDOWN_IMAGE = /!\[[^\]]*\]\([^)]*\)/g;
const MARKDOWN_LINK = /\[[^\]]+\]\([^)]+\)/g;

/**
 * Sanitize a user-supplied freeform-text field for contract storage + PDF render.
 * Returns the cleaned string. Throws on pathological input (null bytes,
 * control chars, etc.) — caller should surface a 422 to the user.
 *
 * NOTE: This is a plain-text-only sanitizer. It is NOT an HTML sanitizer.
 * If you ever need to store rendered HTML from user input, use a proper
 * allow-list library (DOMPurify server-side) instead of this.
 */
export function sanitizePlaintextField(
    input: string | undefined | null,
    opts: { maxLength?: number; fieldName?: string } = {}
): string {
    if (input == null) return '';
    if (typeof input !== 'string') {
        throw new Error(`${opts.fieldName ?? 'field'} must be a string`);
    }

    // Reject null bytes outright (can truncate strings in downstream C libs).
    if (input.includes('\x00')) {
        throw new Error(`${opts.fieldName ?? 'field'} contains null byte`);
    }

    let cleaned = input;

    // Normalize Unicode to NFC (composed form). Consistent across platforms.
    cleaned = cleaned.normalize('NFC');

    // Strip zero-width invisible characters (homograph / steganography defense).
    cleaned = cleaned.replace(ZERO_WIDTH_CHARS, '');

    // Strip HTML tags (basic — anything looking like a tag).
    cleaned = cleaned.replace(HTML_TAG, '');

    // Neutralize dangerous URI schemes inline (e.g. `javascript:alert(1)` → `javascript_:alert(1)`).
    // This preserves the character content for audit but breaks executable semantics.
    cleaned = cleaned.replace(DANGEROUS_URI_SCHEMES, (m) => m.replace(':', '_:'));

    // Neutralize event handlers (e.g. `onclick=` → `onclick_=`).
    cleaned = cleaned.replace(EVENT_HANDLER, (m) => m.replace('=', '_='));

    // Strip Markdown image + link syntax. Markdown is not supported in MVP;
    // rendering in PDF could fetch remote URLs → data-exfil.
    cleaned = cleaned.replace(MARKDOWN_IMAGE, '[image removed]');
    cleaned = cleaned.replace(MARKDOWN_LINK, (m) => m.replace(/\[([^\]]+)\]\([^)]+\)/, '$1'));

    // Remove control chars (except LF 0x0A). Normalize CRLF → LF.
    cleaned = cleaned.replace(/\r\n/g, '\n').replace(CONTROL_CHARS_EXCEPT_LF, '');

    // Collapse runs of 3+ newlines into 2 (prevents paragraph-stuffing attacks).
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

    // Trim leading/trailing whitespace.
    cleaned = cleaned.trim();

    // Enforce length limit if specified.
    if (opts.maxLength != null && cleaned.length > opts.maxLength) {
        cleaned = cleaned.slice(0, opts.maxLength);
    }

    return cleaned;
}

/**
 * Keyword-based soft detection of "unreasonable" contract clauses.
 * Returns an array of flagged phrases; controller can surface as a warning
 * to the hirer ("This clause may discourage applications. Are you sure?").
 *
 * NOT a block. Just a nudge. User can override.
 */
export function detectUnreasonableClauses(text: string): string[] {
    const flags: string[] = [];
    const lower = text.toLowerCase();

    // Penalty mentions with rupee amounts
    if (/penalty.*?(rs\.?|inr|₹)\s*\d+/i.test(text)) {
        flags.push('mentions a penalty with a rupee amount');
    }
    if (/(fine|forfeit).*?(rs\.?|inr|₹)\s*\d+/i.test(text)) {
        flags.push('mentions a fine/forfeiture with a rupee amount');
    }
    if (/deduct.*\d+\s*%/i.test(text)) {
        flags.push('mentions a percentage deduction');
    }
    if (/\b(no show|nosoleh|no-show|bail)\b.*penalty/i.test(lower)) {
        flags.push('mentions a no-show penalty');
    }

    return flags;
}
