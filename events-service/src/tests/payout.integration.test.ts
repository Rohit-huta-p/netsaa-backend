import request from 'supertest';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import app from '../server';
import UserPayoutAccount from '../models/UserPayoutAccount';

process.env.JWT_SECRET = 'test-secret';
process.env.RAZORPAY_WEBHOOK_SECRET = 'whsec_test';

// Mock the Razorpay account creation so no network call happens
jest.mock('../services/razorpay', () => ({
  ...jest.requireActual('../services/razorpay'),
  createLinkedAccount: jest.fn().mockResolvedValue({ linkedAccountId: 'acc_TEST123' }),
}));

const userId = new mongoose.Types.ObjectId().toString();
const token = jwt.sign({ id: userId, role: 'organizer' }, process.env.JWT_SECRET);

const validBody = {
  businessType: 'individual',
  pan: 'ABCDE1234F',
  accountHolderName: 'Saswati Sen',
  bankAccount: '50123456789012',
  ifsc: 'SBIN0007613',
  email: 'saswati@example.com',
};

describe('POST /v1/payouts/account', () => {
  it('creates a UserPayoutAccount with masked fields + linkedAccountId', async () => {
    const res = await request(app).post('/v1/payouts/account')
      .set('Authorization', `Bearer ${token}`).send(validBody);

    expect(res.status).toBe(201);
    expect(res.body.data.status).toMatch(/verified|submitted|pending_kyc/);
    expect(res.body.data.panMasked).toBe('ABCDE****F');
    expect(res.body.data.bankLast4).toBe('9012');

    const doc = await UserPayoutAccount.findOne({ userId });
    expect(doc?.linkedAccountId).toBe('acc_TEST123');
    expect((doc as any).pan).toBeUndefined(); // raw PAN never persisted
  });

  it('is idempotent per user — second submit updates, not duplicates', async () => {
    await request(app).post('/v1/payouts/account').set('Authorization', `Bearer ${token}`).send(validBody);
    await request(app).post('/v1/payouts/account').set('Authorization', `Bearer ${token}`).send(validBody);
    expect(await UserPayoutAccount.countDocuments({ userId })).toBe(1);
  });
});

describe('GET /v1/payouts/account/me', () => {
  it('returns not_started when none exists', async () => {
    const other = jwt.sign({ id: new mongoose.Types.ObjectId().toString(), role: 'organizer' }, process.env.JWT_SECRET!);
    const res = await request(app).get('/v1/payouts/account/me').set('Authorization', `Bearer ${other}`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('not_started');
  });
});
