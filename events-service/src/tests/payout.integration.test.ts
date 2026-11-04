import request from 'supertest';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import app from '../server';
import UserPayoutAccount from '../models/UserPayoutAccount';
import { payments } from '../services/payments';

process.env.JWT_SECRET = 'test-secret';
process.env.RAZORPAY_WEBHOOK_SECRET = 'whsec_test';

// Mock the payment provider so no network call happens (maskPan stays real via ../services/razorpay)
jest.mock('../services/payments', () => ({
  payments: {
    createVendor: jest.fn().mockResolvedValue({ vendorId: 'vendor_TEST123', status: 'verified', raw: 'ACTIVE' }),
    getVendorStatus: jest.fn().mockResolvedValue({ vendorId: 'vendor_TEST123', status: 'verified', raw: 'ACTIVE' }),
  },
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
    expect(doc?.linkedAccountId).toBe('vendor_TEST123');
    expect(doc?.provider).toBe('cashfree');
    expect((doc as any).pan).toBeUndefined(); // raw PAN never persisted
  });

  it('is idempotent per user — second submit updates, not duplicates', async () => {
    await request(app).post('/v1/payouts/account').set('Authorization', `Bearer ${token}`).send(validBody);
    await request(app).post('/v1/payouts/account').set('Authorization', `Bearer ${token}`).send(validBody);
    expect(await UserPayoutAccount.countDocuments({ userId })).toBe(1);
  });

  it('accepts a UPI-only submission — vendor built from the VPA, no bank required', async () => {
    const upiUser = new mongoose.Types.ObjectId().toString();
    const upiToken = jwt.sign({ id: upiUser, role: 'organizer' }, process.env.JWT_SECRET!);
    const createVendor = payments.createVendor as unknown as jest.Mock;
    createVendor.mockClear();

    const res = await request(app).post('/v1/payouts/account')
      .set('Authorization', `Bearer ${upiToken}`)
      .send({
        businessType: 'individual', pan: 'ABCDE1234F', accountHolderName: 'Saswati Sen',
        email: 'saswati@example.com', method: 'upi', vpa: 'saswati@okhdfc',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.payoutMethod).toBe('upi');
    expect(res.body.data.upiVpaMasked).toBe('sa*****@okhdfc'); // masked at rest
    expect(res.body.data.bankLast4).toBeUndefined();

    // The Easy Split vendor was created from the VPA, not bank details.
    expect(createVendor).toHaveBeenCalledWith(expect.objectContaining({ vpa: 'saswati@okhdfc' }));
    expect(createVendor.mock.calls[0][0].bankAccount).toBeUndefined();
  });

  it('rejects a submission with neither UPI nor bank details', async () => {
    const bareUser = jwt.sign({ id: new mongoose.Types.ObjectId().toString(), role: 'organizer' }, process.env.JWT_SECRET!);
    const res = await request(app).post('/v1/payouts/account')
      .set('Authorization', `Bearer ${bareUser}`)
      .send({ businessType: 'individual', pan: 'ABCDE1234F', accountHolderName: 'No Dest', email: 'nd@example.com' });
    expect(res.status).toBe(400);
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
