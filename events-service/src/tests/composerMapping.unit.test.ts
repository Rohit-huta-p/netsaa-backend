/**
 * Pure unit tests for the v4 composer → Event mapping.
 * Runs WITHOUT a database:
 *   npx jest --config='{"preset":"ts-jest","testEnvironment":"node"}' src/tests/composerMapping.unit.test.ts
 */
import { mapComposerToEventDoc } from '../services/composerMapping';

const USER = { id: 'u1', name: 'Rohit', organizationName: 'NETSA' };
const UID = '507f1f77bcf86cd799439011';

const base = (over: any = {}) => ({
  eventType: 'workshop',
  title: 'Kathak Foundations',
  about: 'A hands-on morning on tatkar and posture.',
  registrationMode: 'free_rsvp',
  startsAt: '2026-11-14T13:00:00.000Z',
  durationKind: 'h2',
  location: { kind: 'in_person', venueName: 'Nrityangan', city: 'Pune' },
  spots: [{ name: 'Dancer', capacity: 20, price: 0 }],
  registration: { door: 'open', questions: [] },
  visibility: 'public',
  ...over,
});

describe('mapComposerToEventDoc — derivation rules', () => {
  it('derives capacity/maxParticipants from the SUM of spot capacities (count-on-read)', () => {
    const { doc } = mapComposerToEventDoc(base({
      spots: [{ name: 'Dancer', capacity: 20, price: 0 }, { name: 'Observer', capacity: 10, price: 0 }],
      capacity: { total: 999 }, // client hint — must be ignored
    }), USER, UID);
    expect(doc.capacity.total).toBe(30);
    expect(doc.maxParticipants).toBe(30);
  });

  it('free event → ticketPrice 0 regardless of spot prices', () => {
    const { doc } = mapComposerToEventDoc(base({ registrationMode: 'free_rsvp', spots: [{ name: 'A', capacity: 5, price: 500 }] }), USER, UID);
    expect(doc.ticketPrice).toBe(0);
    expect(doc.pricingMode).toBe('fixed');
  });

  it('paid event → ticketPrice is the LOWEST paid spot price (money-from-spot)', () => {
    const { doc } = mapComposerToEventDoc(base({
      registrationMode: 'paid_ticket',
      spots: [{ name: 'Front', capacity: 10, price: 1500 }, { name: 'Back', capacity: 30, price: 800 }],
    }), USER, UID);
    expect(doc.ticketPrice).toBe(800);
  });

  it('maps about → both description and about; organizerId from auth, not body', () => {
    const { doc } = mapComposerToEventDoc(base({ organizerId: 'HACKER' }), USER, UID);
    expect(doc.description).toBe('A hands-on morning on tatkar and posture.');
    expect(doc.about).toBe('A hands-on morning on tatkar and posture.');
    expect(doc.organizerId).toBe(UID);
  });

  it('in_person → location.type physical; online → online', () => {
    expect(mapComposerToEventDoc(base(), USER, UID).doc.location.type).toBe('physical');
    const online = mapComposerToEventDoc(base({ location: { kind: 'online', onlinePlatform: 'Zoom', meetingLink: 'https://z' } }), USER, UID);
    expect(online.doc.location.type).toBe('online');
  });

  it('schedule.endDate honours an explicit endsAt and recomputes the duration', () => {
    const { doc } = mapComposerToEventDoc(base({ startsAt: '2026-11-14T13:00:00.000Z', endsAt: '2026-11-14T16:00:00.000Z' }), USER, UID);
    expect(doc.schedule.totalDurationMinutes).toBe(180);
    expect(new Date(doc.schedule.endDate).toISOString()).toBe('2026-11-14T16:00:00.000Z');
  });

  it('no endsAt → endDate = start + durationKind minutes', () => {
    const { doc } = mapComposerToEventDoc(base({ durationKind: 'h2' }), USER, UID);
    expect(doc.schedule.totalDurationMinutes).toBe(120);
    expect(new Date(doc.schedule.endDate).getTime()).toBe(new Date('2026-11-14T13:00:00.000Z').getTime() + 120 * 60000);
  });
});

describe('mapComposerToEventDoc — v4 embedded fields', () => {
  it('persists spots, registration door/questions and derives requiresApproval', () => {
    const { doc } = mapComposerToEventDoc(base({
      registration: { door: 'apply', questions: [{ label: 'Instagram', type: 'link', required: true }] },
    }), USER, UID);
    expect(doc.spots).toHaveLength(1);
    expect(doc.registration.door).toBe('apply');
    expect(doc.registration.questions[0]).toMatchObject({ label: 'Instagram', type: 'link', required: true });
    expect(doc.requiresApproval).toBe(true); // door !== open
  });

  it('open door → requiresApproval false', () => {
    expect(mapComposerToEventDoc(base(), USER, UID).doc.requiresApproval).toBe(false);
  });

  it('offers only persist on paid events, and drop invalid spotId refs', () => {
    const free = mapComposerToEventDoc(base({ offers: [{ name: 'Early bird', price: 500, audience: 'everyone' }] }), USER, UID);
    expect(free.doc.offers).toHaveLength(0); // free event
    const paid = mapComposerToEventDoc(base({
      registrationMode: 'paid_ticket',
      spots: [{ name: 'A', capacity: 10, price: 1000 }],
      offers: [{ name: 'Early bird', price: 700, audience: 'everyone', spotId: 'spot-0' }],
    }), USER, UID);
    expect(paid.doc.offers).toHaveLength(1);
    expect(paid.doc.offers[0].spotId).toBeUndefined(); // 'spot-0' is not a valid ObjectId
    expect(paid.doc.offers[0].name).toBe('Early bird');
  });

  it('drops incomplete sub-docs so a create never throws on required fields', () => {
    const { doc } = mapComposerToEventDoc(base({
      spots: [{ name: 'Dancer', capacity: 20, price: 0 }, { name: '  ', capacity: 5, price: 0 }],
      people: [{ displayName: 'Sana', role: 'Judge' }, { displayName: '' }],
      registration: { door: 'open', questions: [{ label: '', type: 'text' }, { label: 'Email', type: 'text' }] },
      lineup: [{ title: 'Warm-up' }, { title: '' }],
    }), USER, UID);
    expect(doc.spots).toHaveLength(1);
    expect(doc.people).toHaveLength(1);
    expect(doc.registration.questions).toHaveLength(1);
    expect(doc.lineup).toHaveLength(1);
  });

  it('timeTbd with no date → placeholder schedule, reminders OFF', () => {
    const { doc, scheduleReminders } = mapComposerToEventDoc(base({ startsAt: undefined, timeTbd: true }), USER, UID);
    expect(doc.timeTbd).toBe(true);
    expect(doc.schedule.startDate instanceof Date).toBe(true);
    expect(scheduleReminders).toBe(false);
  });

  it('a live, dated event schedules reminders', () => {
    expect(mapComposerToEventDoc(base(), USER, UID).scheduleReminders).toBe(true);
  });

  it('persists lineup / bring / included / languages / coverFit / ageRestriction', () => {
    const { doc } = mapComposerToEventDoc(base({
      lineup: [{ when: '10:00', title: 'Tatkar' }],
      bring: { items: ['Ghungroo'], note: 'Cotton clothes' },
      included: ['Certificate', ''],
      languages: ['hi', 'en'],
      coverFit: 'fill',
      ageRestriction: 16,
    }), USER, UID);
    expect(doc.lineup[0]).toMatchObject({ when: '10:00', title: 'Tatkar' });
    expect(doc.bring.items).toEqual(['Ghungroo']);
    expect(doc.included).toEqual(['Certificate']);
    expect(doc.languages).toEqual(['hi', 'en']);
    expect(doc.language).toBe('hi'); // first language mirrors `language`
    expect(doc.coverFit).toBe('fill');
    expect(doc.ageRestriction).toBe(16);
  });
});
