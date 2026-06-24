// src/utils/__tests__/occasionTag.test.ts
import { deriveOccasionTag, KNOWN_OCCASIONS } from '../occasionTag';

describe('deriveOccasionTag', () => {
    it('matches known occasions case/space-insensitively', () => {
        expect(deriveOccasionTag('Sangeet')).toBe('sangeet');
        expect(deriveOccasionTag('  corporate EVENT ')).toBe('corporate');
        expect(deriveOccasionTag('College Fest')).toBe('college_fest');
        expect(deriveOccasionTag('garba night')).toBe('garba');
    });
    it('matches by containment for compound text', () => {
        expect(deriveOccasionTag('my daughter\'s sangeet ceremony')).toBe('sangeet');
        expect(deriveOccasionTag('wedding reception in Pune')).toBe('wedding');
    });
    it('returns null for the long tail', () => {
        expect(deriveOccasionTag('housewarming pooja')).toBeNull();
        expect(deriveOccasionTag('')).toBeNull();
    });
    it('exposes the known set for suggestion pills', () => {
        expect(KNOWN_OCCASIONS.map((k) => k.tag)).toContain('haldi');
    });
});
