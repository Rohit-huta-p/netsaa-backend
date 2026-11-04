import request from 'supertest';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import app from '../server';

process.env.JWT_SECRET = 'test-secret';

// Secure ID (VRS) is mocked — live calls need the product activated on the account.
jest.mock('../services/payments/cashfreeVerification', () => ({
  ...jest.requireActual('../services/payments/cashfreeVerification'),
  verifyBankAccount: jest.fn().mockResolvedValue({
    method: 'bank', valid: true, statusCode: 'ACCOUNT_IS_VALID',
    nameAtBank: 'JOHN DOE', nameMatchScore: 100, nameMatchResult: 'DIRECT_MATCH', bankName: 'YES BANK',
  }),
  verifyVpa: jest.fn().mockResolvedValue({
    method: 'upi', valid: true, statusCode: 'VALID',
    nameAtBank: 'JOHN DOE', nameMatchScore: 100, nameMatchResult: 'DIRECT_MATCH',
  }),
}));
import { verifyVpa } from '../services/payments/cashfreeVerification';

const token = jwt.sign({ id: new mongoose.Types.ObjectId().toString(), role: 'artist' }, process.env.JWT_SECRET);
const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);

describe('POST /v1/payouts/verify-upi', () => {
  it('verifies a VPA and returns the name match', async () => {
    const res = await auth(request(app).post('/v1/payouts/verify-upi').send({ vpa: 'success@upi', accountHolderName: 'John Doe' }));
    expect(res.status).toBe(200);
    expect(res.body.data.valid).toBe(true);
    expect(res.body.data.method).toBe('upi');
    expect(res.body.data.nameAtBank).toBe('JOHN DOE');
    expect(res.body.data.nameMatchAcceptable).toBe(true);
  });

  it('400s without a vpa', async () => {
    const res = await auth(request(app).post('/v1/payouts/verify-upi').send({}));
    expect(res.status).toBe(400);
  });

  it('502s when Secure ID is unavailable (e.g. not provisioned)', async () => {
    (verifyVpa as jest.Mock).mockRejectedValueOnce(new Error('Cashfree VRS POST /upi/penny-drop failed (404)'));
    const res = await auth(request(app).post('/v1/payouts/verify-upi').send({ vpa: 'x@upi' }));
    expect(res.status).toBe(502);
  });
});

describe('POST /v1/payouts/verify-bank', () => {
  it('verifies a bank account and returns the name match', async () => {
    const res = await auth(request(app).post('/v1/payouts/verify-bank').send({ bankAccount: '026291800001191', ifsc: 'YESB0000262', accountHolderName: 'John Doe' }));
    expect(res.status).toBe(200);
    expect(res.body.data.valid).toBe(true);
    expect(res.body.data.method).toBe('bank');
    expect(res.body.data.nameMatchResult).toBe('DIRECT_MATCH');
    expect(res.body.data.nameMatchAcceptable).toBe(true);
  });

  it('400s without bankAccount/ifsc', async () => {
    const res = await auth(request(app).post('/v1/payouts/verify-bank').send({ bankAccount: '123' }));
    expect(res.status).toBe(400);
  });
});
