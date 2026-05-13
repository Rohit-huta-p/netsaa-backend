import { createCipheriv, createDecipheriv, randomBytes, hkdfSync } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const SALT_BYTES = 32;
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;

function getMasterKey(): Buffer {
    const hex = process.env.LINK_ENCRYPTION_KEY;
    if (!hex) throw new Error('LINK_ENCRYPTION_KEY env var required');
    if (hex.length !== 64) throw new Error('LINK_ENCRYPTION_KEY must be 64 hex chars (32 bytes)');
    return Buffer.from(hex, 'hex');
}

function deriveKey(salt: Buffer): Buffer {
    return Buffer.from(hkdfSync('sha256', getMasterKey(), salt, Buffer.from('netsa-event-link'), 32));
}

export function generateSalt(): string {
    return randomBytes(SALT_BYTES).toString('hex');
}

/**
 * Encrypts a meeting link. Stores ciphertext as base64-encoded blob:
 *   iv (12 bytes) | authTag (16 bytes) | ciphertext
 */
export function encryptLink(plaintext: string, saltHex: string): string {
    const salt = Buffer.from(saltHex, 'hex');
    const key = deriveKey(salt);
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, ct]).toString('base64');
}

export function decryptLink(ciphertextB64: string, saltHex: string): string {
    const salt = Buffer.from(saltHex, 'hex');
    const key = deriveKey(salt);
    const blob = Buffer.from(ciphertextB64, 'base64');
    const iv = blob.subarray(0, IV_BYTES);
    const tag = blob.subarray(IV_BYTES, IV_BYTES + AUTH_TAG_BYTES);
    const ct = blob.subarray(IV_BYTES + AUTH_TAG_BYTES);
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
    return pt.toString('utf8');
}
