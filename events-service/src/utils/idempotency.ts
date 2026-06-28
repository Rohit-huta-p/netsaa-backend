import EventRegistration, { IEventRegistration } from '../models/EventRegistration';

interface RegistrationInput {
  eventId: any;
  userId: any;
  quantity: number;
  attendees: { fullName: string; phone: string; email?: string; notes?: string }[];
  source: 'standard' | 'walkup' | 'admin_added';
  visibility: 'public' | 'private';
  ticketTypeId?: any;
}

/**
 * Idempotent create: if a registration with this idempotencyKey already exists,
 * return it untouched. Relies on the unique index on idempotencyKey to win races —
 * on duplicate-key error we re-fetch the existing row.
 */
export async function findOrCreateRegistration(
  idempotencyKey: string,
  input: RegistrationInput,
): Promise<{ registration: IEventRegistration; created: boolean }> {
  const existing = await EventRegistration.findOne({ idempotencyKey });
  if (existing) return { registration: existing, created: false };

  try {
    const registration = await EventRegistration.create({ ...input, idempotencyKey, status: 'registered' });
    return { registration, created: true };
  } catch (err: any) {
    if (err?.code === 11000) {
      const raced = await EventRegistration.findOne({ idempotencyKey });
      if (raced) return { registration: raced, created: false };
    }
    throw err;
  }
}
