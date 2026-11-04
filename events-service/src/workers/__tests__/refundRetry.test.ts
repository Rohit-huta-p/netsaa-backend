import mongoose from 'mongoose';
import Refund from '../../models/Refund';
import { processPendingRefunds } from '../refundRetryWorker';

// Refund submission now goes through the provider abstraction, not the legacy Razorpay client.
jest.mock('../../services/payments', () => ({
  payments: {
    createRefund: jest.fn()
      .mockResolvedValueOnce({ refundId: 'cfr_ok', status: 'PENDING' })   // async → stays pending
      .mockRejectedValueOnce(new Error('gateway down')),                   // fails
  },
}));
import { payments } from '../../services/payments';

describe('processPendingRefunds', () => {
  it('submits via the provider and records the refund id (async → stays pending)', async () => {
    await Refund.create({
      registrationId: new mongoose.Types.ObjectId(), eventId: new mongoose.Types.ObjectId(), userId: new mongoose.Types.ObjectId(),
      razorpayPaymentId: 'pay_a', razorpayOrderId: 'order_a', trigger: 'attendee_cancel', triggeredBy: new mongoose.Types.ObjectId(),
      refundAmountPaise: 450000, status: 'pending', initiatedAt: new Date(),
    });
    await processPendingRefunds();
    const r = await Refund.findOne({ razorpayPaymentId: 'pay_a' });
    expect(r?.razorpayRefundId).toBe('cfr_ok');
    expect(r?.status).toBe('pending'); // stays pending until the REFUND_STATUS webhook confirms
    // amount converted paise→rupees at the provider boundary; refunds by order_id
    expect(payments.createRefund as jest.Mock).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: 'order_a', amountRupees: 4500 }),
    );
  });

  it('increments retryCount and records the error on provider failure', async () => {
    await Refund.create({
      registrationId: new mongoose.Types.ObjectId(), eventId: new mongoose.Types.ObjectId(), userId: new mongoose.Types.ObjectId(),
      razorpayPaymentId: 'pay_b', razorpayOrderId: 'order_b', trigger: 'attendee_cancel', triggeredBy: new mongoose.Types.ObjectId(),
      refundAmountPaise: 450000, status: 'pending', initiatedAt: new Date(),
    });
    await processPendingRefunds();
    const r = await Refund.findOne({ razorpayPaymentId: 'pay_b' });
    expect(r?.retryCount).toBe(1);
    expect(r?.lastErrorMessage).toMatch(/gateway down/);
  });
});
