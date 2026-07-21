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

import { renderEmailVerifyEmail } from '../email/email.templates';
describe('renderEmailVerifyEmail', () => {
  it('includes the code and a plain, non-scary subject', () => {
    const r = renderEmailVerifyEmail({ displayName: 'Priya', code: '482917' });
    expect(r.subject).toContain('482917');
    expect(r.text).toContain('482917');
    expect(r.subject.toLowerCase()).not.toContain('kyc');
  });
});

// ── sendEmailCode controller ──────────────────────────────────────────────
// Unit-level: the route isn't mounted yet (later task), so we call the
// controller function directly instead of going through supertest + app.
//
// NOTE ON DB SETUP: the brief pointed at otpRegister.test.ts's "mongodb-memory-server
// harness", but that file doesn't actually use mongodb-memory-server (it isn't a
// users-service dependency — confirmed absent from package.json/node_modules; it IS
// used by sibling services like events-service/media-service, but not here). What
// otpRegister.test.ts actually does is fully jest.mock() the Mongoose models it needs
// (User, OtpSession) and hit the real Express app with supertest. We mirror that same
// mocking approach here (mocking `User` and `email.queue`) rather than pull in a new
// dependency this task isn't scoped to add (see ev-task-4-report.md for detail).
jest.mock('../email/email.queue', () => ({
  __esModule: true,
  emailQueue: { add: jest.fn().mockResolvedValue(undefined) },
}));

const mockUserFindOne = jest.fn();
jest.mock('../models/User', () => ({
  __esModule: true,
  default: {
    findOne: (...a: any[]) => mockUserFindOne(...a),
  },
}));

import { sendEmailCode } from '../modules/auth/controllers/email-otp.controller';
import { emailQueue } from '../email/email.queue';

const fakeRes = () => {
  const res: any = {
    status(c: number) { res.code = c; return res; },
    json(b: any) { res.body = b; return res; },
  };
  return res;
};

describe('sendEmailCode', () => {
  beforeEach(() => {
    mockUserFindOne.mockReset();
    (emailQueue.add as jest.Mock).mockClear();
  });

  it('rejects an email already verified on another account (409)', async () => {
    const otherUserId = new mongoose.Types.ObjectId();
    mockUserFindOne.mockResolvedValue({
      _id: otherUserId,
      email: 'taken@x.com',
      emailVerifiedAt: new Date(),
    });

    const req = {
      user: { _id: new mongoose.Types.ObjectId(), displayName: 'Priya' },
      body: { email: 'taken@x.com' },
    } as any;
    const res = fakeRes();

    await sendEmailCode(req, res);

    expect(res.code).toBe(409);
    expect(res.body.meta.status).toBe(409);
    expect(mockUserFindOne).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'taken@x.com' }),
    );
    // Short-circuits before ever touching the email provider.
    expect(emailQueue.add).not.toHaveBeenCalled();
  });
});
