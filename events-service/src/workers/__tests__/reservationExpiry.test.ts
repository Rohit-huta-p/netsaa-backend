import mongoose from 'mongoose';
import EventReservation from '../../models/EventReservation';
import { sweepExpiredReservations } from '../reservationExpiryWorker';

describe('sweepExpiredReservations', () => {
  it('releases reservations past expiresAt that are still reserved', async () => {
    await EventReservation.create({
      eventId: new mongoose.Types.ObjectId(), userId: new mongoose.Types.ObjectId(),
      quantity: 1, totalAmount: 4606.2, status: 'reserved',
      expiresAt: new Date(Date.now() - 1000), idempotencyKey: 'expired-1',
    });
    const released = await sweepExpiredReservations();
    expect(released).toBe(1);
    const doc = await EventReservation.findOne({ idempotencyKey: 'expired-1' });
    expect(doc?.status).toBe('released');
  });

  it('leaves paid reservations alone', async () => {
    await EventReservation.create({
      eventId: new mongoose.Types.ObjectId(), userId: new mongoose.Types.ObjectId(),
      quantity: 1, totalAmount: 4606.2, status: 'paid',
      expiresAt: new Date(Date.now() - 1000), idempotencyKey: 'paid-1',
    });
    await sweepExpiredReservations();
    const doc = await EventReservation.findOne({ idempotencyKey: 'paid-1' });
    expect(doc?.status).toBe('paid');
  });
});
