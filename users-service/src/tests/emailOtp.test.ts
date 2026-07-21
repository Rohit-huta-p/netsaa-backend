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

  it('never mentions reset or password anywhere in the rendered HTML', () => {
    const r = renderEmailVerifyEmail({ displayName: 'Priya', code: '482917' });
    expect(r.html).not.toMatch(/reset/i);
    expect(r.html).not.toMatch(/password/i);
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
const mockUserFindById = jest.fn();
jest.mock('../models/User', () => ({
  __esModule: true,
  default: {
    findOne: (...a: any[]) => mockUserFindOne(...a),
    findById: (...a: any[]) => mockUserFindById(...a),
  },
}));

import { sendEmailCode, verifyEmailCode } from '../modules/auth/controllers/email-otp.controller';
import { emailQueue } from '../email/email.queue';
import { hashOTP } from '../modules/auth/services/otp.service';

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

// ── verifyEmailCode controller ──────────────────────────────────────────
// Same rationale as sendEmailCode above (route isn't mounted yet — see the
// NOTE ON DB SETUP comment): call the controller directly.
//
// EmailOtpSession is NOT jest.mock()'d (unlike User) because this file already
// has a REAL (unmocked) `import EmailOtpSession from '...'` at the very top,
// used by the "EmailOtpSession model" describe block above. jest.mock() for a
// module path applies to ALL bindings of that path within the file — even ones
// that textually precede the jest.mock() call — so mocking it here turned that
// earlier `new EmailOtpSession(...)` call into "not a constructor" (confirmed
// empirically while building this test: TypeError: emailOtpSession_model_1.default
// is not a constructor). Instead we jest.spyOn() the two real, already-imported
// EmailOtpSession's static methods the controller calls — this patches the same
// shared singleton object the controller imports via its own
// `../models/emailOtpSession.model` path (same resolved module).
const chain = (val: any) => ({ sort: () => Promise.resolve(val) });

describe('verifyEmailCode', () => {
  const EMAIL = 'priya.iyer@gmail.com';
  const CODE = '482917';
  const CODE_HASH = hashOTP(CODE); // real hashOTP (unmocked in this file) — must match the controller's own hash

  beforeEach(() => {
    mockUserFindById.mockReset();
    jest.spyOn(EmailOtpSession, 'findOne').mockReset();
    jest.spyOn(EmailOtpSession, 'findOneAndUpdate').mockReset();
  });

  const validSession = (overrides: any = {}) => ({
    _id: new mongoose.Types.ObjectId(),
    email: EMAIL,
    codeHash: CODE_HASH,
    attempts: 0,
    isUsed: false,
    expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  });

  it('verifyEmailCode sets emailVerifiedAt and bumps kycLevel to 1 when phone is already verified', async () => {
    const session = validSession();
    (EmailOtpSession.findOne as jest.Mock).mockReturnValue(chain(session));
    (EmailOtpSession.findOneAndUpdate as jest.Mock).mockResolvedValue({ _id: session._id, isUsed: true });

    const userId = new mongoose.Types.ObjectId();
    const user: any = {
      _id: userId,
      displayName: 'Priya',
      phoneNumber: '+919876543210',
      role: 'artist',
      phoneVerifiedAt: new Date(),
      kycLevel: 0,
      passwordHash: 'super-secret-hash',
      save: jest.fn().mockResolvedValue(undefined),
      toObject: () => ({ ...user }),
    };
    mockUserFindById.mockResolvedValue(user);

    const req = { user: { _id: userId }, body: { email: EMAIL, code: CODE } } as any;
    const res = fakeRes();

    await verifyEmailCode(req, res);

    expect(res.code).toBe(200);
    expect(EmailOtpSession.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: session._id, isUsed: false },
      { $set: { isUsed: true } },
    );
    expect(user.emailVerifiedAt).toBeTruthy();
    expect(user.kycLevel).toBe(1);
    expect(user.email).toBe(EMAIL);
    // Sanitized: the envelope's data must not leak the password hash.
    expect(res.body.data.passwordHash).toBeUndefined();
  });

  it('leaves kycLevel at 0 when phone is not verified', async () => {
    const session = validSession();
    (EmailOtpSession.findOne as jest.Mock).mockReturnValue(chain(session));
    (EmailOtpSession.findOneAndUpdate as jest.Mock).mockResolvedValue({ _id: session._id, isUsed: true });

    const userId = new mongoose.Types.ObjectId();
    const user: any = {
      _id: userId,
      displayName: 'Arjun',
      role: 'artist',
      phoneVerifiedAt: undefined,
      kycLevel: 0,
      save: jest.fn().mockResolvedValue(undefined),
      toObject: () => ({ ...user }),
    };
    mockUserFindById.mockResolvedValue(user);

    const req = { user: { _id: userId }, body: { email: EMAIL, code: CODE } } as any;
    const res = fakeRes();

    await verifyEmailCode(req, res);

    expect(res.code).toBe(200);
    expect(user.emailVerifiedAt).toBeTruthy();
    expect(user.kycLevel).toBe(0);
  });
});
