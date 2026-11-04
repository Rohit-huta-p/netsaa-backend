import { isNameMatchAcceptable, VerificationResult } from '../services/payments/cashfreeVerification';

const base = (over: Partial<VerificationResult>): VerificationResult => ({ method: 'bank', valid: true, ...over });

describe('isNameMatchAcceptable', () => {
  it('DIRECT/GOOD/MATCH → true', () => {
    for (const r of ['DIRECT_MATCH', 'GOOD_PARTIAL_MATCH', 'MATCH'] as const) {
      expect(isNameMatchAcceptable(base({ nameMatchResult: r }))).toBe(true);
    }
  });
  it('MODERATE/POOR/NO_MATCH → false', () => {
    for (const r of ['MODERATE_PARTIAL_MATCH', 'POOR_PARTIAL_MATCH', 'NO_MATCH'] as const) {
      expect(isNameMatchAcceptable(base({ nameMatchResult: r }))).toBe(false);
    }
  });
  it('falls back to score ≥70 when no result label', () => {
    expect(isNameMatchAcceptable(base({ nameMatchScore: 85 }))).toBe(true);
    expect(isNameMatchAcceptable(base({ nameMatchScore: 70 }))).toBe(true);
    expect(isNameMatchAcceptable(base({ nameMatchScore: 38 }))).toBe(false);
  });
  it('no name info → true (nothing to reject on)', () => {
    expect(isNameMatchAcceptable(base({}))).toBe(true);
  });
});

describe('CASHFREE_DEV_MODE verification fakes', () => {
  const prev = process.env.CASHFREE_DEV_MODE;
  beforeAll(() => { process.env.CASHFREE_DEV_MODE = '1'; jest.resetModules(); });
  afterAll(() => { if (prev === undefined) delete process.env.CASHFREE_DEV_MODE; else process.env.CASHFREE_DEV_MODE = prev; jest.resetModules(); });

  it('fakes UPI (valid / invalid@upi) and bank without network', async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const m = require('../services/payments/cashfreeVerification');
    expect((await m.verifyVpa({ vpa: 'success@upi' })).valid).toBe(true);
    expect((await m.verifyVpa({ vpa: 'invalid@upi' })).valid).toBe(false);
    expect((await m.verifyBankAccount({ bankAccount: '123456', ifsc: 'YESB0000262' })).valid).toBe(true);
  });
});
