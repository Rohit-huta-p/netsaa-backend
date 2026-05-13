import { encryptLink, decryptLink, generateSalt } from '../services/encryptedLink.service';

describe('encryptedLink.service', () => {
    beforeAll(() => {
        process.env.LINK_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    });

    it('round-trips a meeting link', () => {
        const salt = generateSalt();
        const enc = encryptLink('https://zoom.us/j/123456', salt);
        const dec = decryptLink(enc, salt);
        expect(dec).toBe('https://zoom.us/j/123456');
    });

    it('produces different ciphertexts for different salts', () => {
        const a = encryptLink('https://meet.google.com/abc', generateSalt());
        const b = encryptLink('https://meet.google.com/abc', generateSalt());
        expect(a).not.toBe(b);
    });

    it('throws when decrypting with wrong salt', () => {
        const correct = generateSalt();
        const wrong = generateSalt();
        const enc = encryptLink('https://x.com', correct);
        expect(() => decryptLink(enc, wrong)).toThrow();
    });

    it('generates 32-byte hex salts', () => {
        const s = generateSalt();
        expect(s).toMatch(/^[0-9a-f]{64}$/);
    });
});
