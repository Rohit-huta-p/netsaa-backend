import mongoose from 'mongoose';
import EventRegistration from '../../models/EventRegistration';
import { findOrCreateRegistration } from '../idempotency';

describe('findOrCreateRegistration', () => {
  const eventId = new mongoose.Types.ObjectId();
  const userId = new mongoose.Types.ObjectId();

  const base = {
    eventId, userId, quantity: 1, source: 'standard' as const, visibility: 'public' as const,
    attendees: [{ fullName: 'Aditi', phone: '+919876543210' }],
  };

  it('creates a new registration on first call', async () => {
    const { registration, created } = await findOrCreateRegistration('key-1', base);
    expect(created).toBe(true);
    expect(registration.idempotencyKey).toBe('key-1');
  });

  it('returns the same registration on replay with the same key', async () => {
    const first = await findOrCreateRegistration('key-2', base);
    const replay = await findOrCreateRegistration('key-2', base);
    expect(replay.created).toBe(false);
    expect(replay.registration._id.toString()).toBe(first.registration._id.toString());
  });
});
