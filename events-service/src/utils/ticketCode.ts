import { randomBytes } from 'crypto';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous chars (I,O,0,1)

function randomSuffix(len: number): string {
  const bytes = randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

/** Two-letter prefix from the event title's word initials, fallback 'NS'. */
function prefixFromTitle(title: string): string {
  const initials = title
    .split(/\s+/)
    .map((w) => w.replace(/[^A-Za-z]/g, '')[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return initials.length === 2 ? initials : initials.length === 1 ? initials + 'X' : 'NS';
}

export function generateTicketCode(eventTitle: string): string {
  return `${prefixFromTitle(eventTitle)}-${randomSuffix(4)}`;
}

export function generateBackupCode(): string {
  const n = randomBytes(3).readUIntBE(0, 3) % 1000000;
  return n.toString().padStart(6, '0');
}
