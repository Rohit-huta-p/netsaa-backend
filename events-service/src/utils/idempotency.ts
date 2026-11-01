import EventRegistration, { IEventRegistration } from '../models/EventRegistration';

interface RegistrationInput {
  eventId: any;
  userId: any;
  quantity: number;
  attendees: { fullName: string; phone: string; email?: string; notes?: string }[];
  answers?: { questionId?: any; label: string; type: string; value: string }[];
  source: 'standard' | 'walkup' | 'admin_added';
  visibility: 'public' | 'private';
  ticketTypeId?: any;
  spotId?: any;
  // 'pending' for approval-gated doors (guest_list / apply); defaults to 'registered' (§6a-c/d).
  status?: 'registered' | 'pending';
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
    const registration = await EventRegistration.create({ ...input, idempotencyKey, status: input.status ?? 'registered' });
    return { registration, created: true };
  } catch (err: any) {
    if (err?.code === 11000) {
      const raced = await EventRegistration.findOne({ idempotencyKey });
      if (raced) return { registration: raced, created: false };
    }
    throw err;
  }
}
