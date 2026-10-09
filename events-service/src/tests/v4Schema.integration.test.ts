import mongoose from 'mongoose';
import Event from '../models/Event';

// Schema-only smoke test (Phase 1 wires create/reserve; here we prove the model
// accepts and round-trips the new v4 fields, and that the widened enums guard).
describe('v4 schema scaffolding — the model stores the new fields', () => {
  it('round-trips spots, offers, registration, people, lineup, bring, included, ticketSales', async () => {
    const doc = await Event.create({
      title: 'Kathak v4', description: 'x'.repeat(120), eventType: 'audition', category: 'dance',
      organizerId: new mongoose.Types.ObjectId(), organizerSnapshot: { name: 'S', organizationName: 'Sawai' },
      pricingMode: 'fixed', ticketPrice: 4500,
      schedule: { startDate: new Date(), endDate: new Date(Date.now() + 3600000), totalDurationMinutes: 60, dayBreakdown: [] },
      location: { type: 'physical' }, maxParticipants: 24, status: 'draft',
      eventTypeLabel: 'Open call', otherArtistTypes: ['Director'], openToAll: false,
      languages: ['hi', 'en'], timeTbd: false, coverFit: 'whole',
      people: [{ displayName: 'Meera K.', role: 'Casting director', invite: { status: 'invited' } }],
      spots: [{ name: 'Seats', capacity: 24, price: 4500 }, { name: 'Observer', note: 'Watches', capacity: 6, price: 1500 }],
      offers: [{ name: 'Early bird', price: 3900, audience: 'everyone', seatLimit: 10 }],
      registration: { door: 'apply', questions: [{ label: 'Showreel', type: 'link', required: true }] },
      requiresApproval: true,
      lineup: [{ when: 'Day 1', title: 'Tatkar', detail: 'Footwork' }],
      bring: { items: ['Ghungroo'], note: 'Cotton kurta' },
      included: ['Certificate'],
      ticketSales: 'waiting_for_bank',
      notifyMe: [new mongoose.Types.ObjectId()],
    } as any);

    const f: any = await Event.findById(doc._id).lean();
    expect(f.eventType).toBe('audition');              // widened enum accepts it
    expect(f.spots).toHaveLength(2);
    expect(f.spots[1].name).toBe('Observer');
    expect(f.offers[0].seatLimit).toBe(10);
    expect(f.registration.door).toBe('apply');
    expect(f.registration.questions[0].type).toBe('link');
    expect(f.people[0].role).toBe('Casting director');
    expect(f.lineup[0].title).toBe('Tatkar');
    expect(f.bring.items).toEqual(['Ghungroo']);
    expect(f.included).toEqual(['Certificate']);
    expect(f.ticketSales).toBe('waiting_for_bank');
    expect(f.coverFit).toBe('whole');
    expect(f.languages).toEqual(['hi', 'en']);
    expect(f.notifyMe).toHaveLength(1);
  });

  it('enum guards reject an unknown eventType', async () => {
    await expect(Event.create({
      title: 'Bad enum', description: 'x'.repeat(120), eventType: 'nonsense', category: 'x',
      organizerId: new mongoose.Types.ObjectId(), organizerSnapshot: { name: 'S', organizationName: 'x' },
      pricingMode: 'fixed', ticketPrice: 0,
      schedule: { startDate: new Date(), endDate: new Date(), totalDurationMinutes: 60, dayBreakdown: [] },
      location: { type: 'physical' }, maxParticipants: 1, status: 'draft',
    } as any)).rejects.toBeTruthy();
  });
});
