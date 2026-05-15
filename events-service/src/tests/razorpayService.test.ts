jest.mock('razorpay');

import {
  createEventOrder,
  fetchPayment,
  triggerRefund,
} from '../services/razorpay.service';
import Razorpay from 'razorpay';

const mockOrdersCreate = jest.fn();
const mockPaymentsFetch = jest.fn();
const mockPaymentsRefund = jest.fn();

(Razorpay as unknown as jest.Mock).mockImplementation(() => ({
  orders: { create: mockOrdersCreate },
  payments: { fetch: mockPaymentsFetch, refund: mockPaymentsRefund },
}));

beforeAll(() => {
  process.env.RAZORPAY_KEY_ID = 'rzp_test_test';
  process.env.RAZORPAY_KEY_SECRET = 'secret';
});

beforeEach(() => jest.clearAllMocks());

describe('razorpay.service', () => {
  describe('createEventOrder', () => {
    it('multiplies INR amount to paise + includes receipt + notes', async () => {
      mockOrdersCreate.mockResolvedValue({ id: 'order_test123', amount: 49900, currency: 'INR' });

      const order = await createEventOrder({
        amountInRupees: 499,
        receiptKey: 'evt-abc-user-123',
        notes: { eventId: 'abc', registrantId: 'user-123', attendeeCount: 1 },
      });

      expect(order.id).toBe('order_test123');
      expect(mockOrdersCreate).toHaveBeenCalledWith({
        amount: 49900,
        currency: 'INR',
        receipt: 'evt-abc-user-123',
        notes: { eventId: 'abc', registrantId: 'user-123', attendeeCount: '1' },
        payment_capture: 1,
      });
    });

    it('rounds non-integer rupee amounts safely', async () => {
      mockOrdersCreate.mockResolvedValue({ id: 'order_x', amount: 49950, currency: 'INR' });
      await createEventOrder({ amountInRupees: 499.5, receiptKey: 'r', notes: {} });
      expect(mockOrdersCreate).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 49950 })
      );
    });
  });

  describe('fetchPayment', () => {
    it('returns paymentId + amount + status', async () => {
      mockPaymentsFetch.mockResolvedValue({
        id: 'pay_abc',
        amount: 49900,
        currency: 'INR',
        status: 'captured',
        order_id: 'order_x',
      });
      const p = await fetchPayment('pay_abc');
      expect(p.status).toBe('captured');
      expect(p.id).toBe('pay_abc');
    });
  });

  describe('triggerRefund', () => {
    it('issues full refund by default', async () => {
      mockPaymentsRefund.mockResolvedValue({ id: 'rfnd_x', status: 'processed', amount: 49900 });
      const r = await triggerRefund('pay_abc');
      expect(mockPaymentsRefund).toHaveBeenCalledWith('pay_abc', { speed: 'normal' });
      expect(r.id).toBe('rfnd_x');
    });

    it('honors partial refund amount in paise', async () => {
      mockPaymentsRefund.mockResolvedValue({ id: 'rfnd_y', status: 'processed', amount: 24950 });
      await triggerRefund('pay_abc', 249.5);
      expect(mockPaymentsRefund).toHaveBeenCalledWith('pay_abc', { amount: 24950, speed: 'normal' });
    });
  });
});
