import { normalizeTag, isValidTagId } from '../services/tagNormalization.service';

describe('normalizeTag', () => {
    it('lowercases ASCII', () => {
        expect(normalizeTag('Workshop')).toBe('workshop');
        expect(normalizeTag('AUDITION')).toBe('audition');
    });

    it('trims surrounding whitespace', () => {
        expect(normalizeTag('  workshop  ')).toBe('workshop');
        expect(normalizeTag('\nworkshop\t')).toBe('workshop');
    });

    it('replaces internal whitespace with hyphens', () => {
        expect(normalizeTag('jam session')).toBe('jam-session');
        expect(normalizeTag('open mic')).toBe('open-mic');
        expect(normalizeTag('a   b   c')).toBe('a-b-c');
    });

    it('strips zero-width characters', () => {
        expect(normalizeTag('work​shop')).toBe('workshop');
        expect(normalizeTag('audi‍tion')).toBe('audition');
    });

    it('strips emoji and punctuation', () => {
        expect(normalizeTag('workshop!')).toBe('workshop');
        expect(normalizeTag('🎭audition')).toBe('audition');
        expect(normalizeTag('q&a')).toBe('qa');
    });

    it('preserves Devanagari', () => {
        expect(normalizeTag('ब्रह्मांड')).toMatch(/^[ऀ-ॿ-]+$/);
    });

    it('NFC normalizes Unicode', () => {
        const composed = 'é';        // é (precomposed)
        const decomposed = 'é';      // é (decomposed)
        expect(normalizeTag(composed)).toBe(normalizeTag(decomposed));
    });

    it('truncates to 30 chars', () => {
        const long = 'a'.repeat(50);
        expect(normalizeTag(long)).toHaveLength(30);
    });

    it('returns empty for input that becomes empty after normalization', () => {
        expect(normalizeTag('   ')).toBe('');
        expect(normalizeTag('!!!')).toBe('');
        expect(normalizeTag('🎭')).toBe('');
    });
});

describe('isValidTagId', () => {
    it('accepts normalized lowercase', () => {
        expect(isValidTagId('workshop')).toBe(true);
        expect(isValidTagId('jam-session')).toBe(true);
    });

    it('rejects uppercase', () => {
        expect(isValidTagId('Workshop')).toBe(false);
    });

    it('rejects spaces', () => {
        expect(isValidTagId('jam session')).toBe(false);
    });

    it('rejects empty', () => {
        expect(isValidTagId('')).toBe(false);
    });

    it('rejects > 30 chars', () => {
        expect(isValidTagId('a'.repeat(31))).toBe(false);
    });
});
