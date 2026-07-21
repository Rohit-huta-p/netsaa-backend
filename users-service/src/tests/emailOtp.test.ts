import mongoose from 'mongoose';
import EmailOtpSession from '../modules/auth/models/emailOtpSession.model';

describe('EmailOtpSession model', () => {
  it('persists a hashed code session with defaults', () => {
    const s = new EmailOtpSession({
      userId: new mongoose.Types.ObjectId(),
      email: 'priya.iyer@gmail.com',
      codeHash: 'deadbeef',
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    });
    expect(s.attempts).toBe(0);
    expect(s.isUsed).toBe(false);
    expect(s.email).toBe('priya.iyer@gmail.com');
  });
});

import { isValidEmail } from '../modules/auth/services/otp.service';
describe('isValidEmail', () => {
  it('accepts a normal address and rejects junk', () => {
    expect(isValidEmail('priya.iyer@gmail.com')).toBe(true);
    expect(isValidEmail('nope')).toBe(false);
    expect(isValidEmail('a@b')).toBe(false);
  });
});
