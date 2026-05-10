/**
 * Normalize hirer-typed text into a stable tag _id.
 *
 * Rules:
 *  - NFC normalize (collapse composed/decomposed forms)
 *  - Lowercase (ASCII case-fold; Devanagari is already case-less)
 *  - Strip zero-width chars (U+200B - U+200D, U+FEFF)
 *  - Strip everything except letters, digits, whitespace, and hyphens
 *  - Trim
 *  - Replace runs of whitespace with single hyphens
 *  - Truncate to 30 chars
 */
export function normalizeTag(input: string): string {
    return input
        .normalize('NFC')
        .toLowerCase()
        .replace(/[​-‍﻿]/g, '')
        .replace(/[^\p{L}\p{N}\s-]/gu, '')
        .trim()
        .replace(/\s+/g, '-')
        .slice(0, 30);
}

const VALID_RE = /^[\p{Ll}\p{N}ऀ-ॿ-]{1,30}$/u;
//                ASCII lowercase + digits + Devanagari + hyphen, 1-30 chars

export function isValidTagId(id: string): boolean {
    if (!id) return false;
    if (id.length > 30) return false;
    return VALID_RE.test(id);
}
