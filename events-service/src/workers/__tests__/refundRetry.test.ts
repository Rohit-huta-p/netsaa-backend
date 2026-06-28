import mongoose from 'mongoose';
import Refund from '../../models/Refund';
import { processPendingRefunds } from '../refundRetryWorker';

jest.mock('../../services/razorpay', () => ({
  createRefund: jest.fn()
    .mockResolvedValueOnce({ refundId: 'rfnd_ok' })       // first call OK
    .mockRejectedValueOnce(new Error('gateway down')),     // second call fails
}));

describe('processPendingRefunds', () => {
  it('submits pending refunds and records the razorpayRefundId', async () => {
    await Refund.create({
      registrationId: new mongoose.Types.ObjectId(), eventId: new mongoose.Types.ObjectId(), userId: new mongoose.Types.ObjectId(),
      razorpayPaymentId: 'pay_a', trigger: 'attendee_cancel', triggeredBy: new mongoose.Types.ObjectId(),
      refundAmountPaise: 450000, status: 'pending', initiatedAt: new Date(),
    });
    await processPendingRefunds();
    const r = await Refund.findOne({ razorpayPaymentId: 'pay_a' });
    expect(r?.razorpayRefundId).toBe('rfnd_ok'); // stays 'pending' until refund.processed webhook
  });

  it('increments retryCount and records error on failure', async () => {
    await Refund.create({
      registrationId: new mongoose.Types.ObjectId(), eventId: new mongoose.Types.ObjectId(), userId: new mongoose.Types.ObjectId(),
      razorpayPaymentId: 'pay_b', trigger: 'attendee_cancel', triggeredBy: new mongoose.Types.ObjectId(),
      refundAmountPaise: 450000, status: 'pending', initiatedAt: new Date(),
    });
    await processPendingRefunds();
    const r = await Refund.findOne({ razorpayPaymentId: 'pay_b' });
    expect(r?.retryCount).toBe(1);
    expect(r?.lastErrorMessage).toMatch(/gateway down/);
  });
});
