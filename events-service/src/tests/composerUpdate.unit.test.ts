/**
 * Pure unit tests for the v4 composer PATCH mapping.
 *   npx jest --config='{"preset":"ts-jest","testEnvironment":"node"}' src/tests/composerUpdate.unit.test.ts
 */
import { buildComposerUpdate, isComposerPatch } from '../services/composerMapping';

const existing = () => ({
  registrationMode: 'free_rsvp',
  spots: [{ name: 'Dancer', capacity: 20, price: 0 }],
  capacity: { total: 20 },
  ticketPrice: 0,
  registration: { door: 'open' },
  location: { type: 'physical', kind: 'in_person', venueName: 'Old Studio', city: 'Pune', address: 'FC Road' },
  durationKind: 'h2',
  startsAt: new Date('2026-11-14T13:00:00.000Z'),
  schedule: { dayBreakdown: [{ date: new Date(), durationMinutes: 60 }] },
});

describe('isComposerPatch', () => {
  it('true when the body carries a v4-specific key', () => {
    expect(isComposerPatch({ about: 'x' })).toBe(true);
    expect(isComposerPatch({ spots: [] })).toBe(true);
    expect(isComposerPatch({ registration: { door: 'open' } })).toBe(true);
  });
  it('false for a plain single-field edit (stays on the legacy whitelist path)', () => {
    expect(isComposerPatch({ title: 'New' })).toBe(false);
    expect(isComposerPatch({ visibility: 'unlisted' })).toBe(false);
    expect(isComposerPatch({ location: { venueName: 'X' } })).toBe(false);
  });
});

describe('buildComposerUpdate — only touches provided fields', () => {
  it('sets just the present fields and never the protected ones', () => {
    const set = buildComposerUpdate({ about: 'Updated copy', title: 'New title' }, existing());
    expect(set.title).toBe('New title');
    expect(set.about).toBe('Updated copy');
    expect(set.description).toBe('Updated copy'); // kept in sync
    for (const k of ['status', 'organizerId', 'organizerSnapshot', 'publishedAt', 'pricingMode']) {
      expect(set).not.toHaveProperty(k);
    }
  });
});

describe('buildComposerUpdate — derived capacity & money', () => {
  it('spots change → capacity.total, maxParticipants and ticketPrice recomputed', () => {
    const set = buildComposerUpdate({
      registrationMode: 'paid_ticket',
      spots: [{ name: 'Front', capacity: 10, price: 1500 }, { name: 'Back', capacity: 5, price: 900 }],
      offers: [],
    }, existing());
    expect(set['capacity.total']).toBe(15);
    expect(set.maxParticipants).toBe(15);
    expect(set.ticketPrice).toBe(900); // lowest paid spot
  });

  it('mode flip paid → free zeroes ticketPrice and clears offers', () => {
    const paid = { ...existing(), registrationMode: 'paid_ticket', spots: [{ name: 'A', capacity: 10, price: 1000 }], ticketPrice: 1000, offers: [{ name: 'Early', price: 700, audience: 'everyone' }] };
    const set = buildComposerUpdate({ registrationMode: 'free_rsvp', offers: [] }, paid);
    expect(set.ticketPrice).toBe(0);
    expect(set.offers).toEqual([]);
  });

  it('mode change with no spots in the body falls back to existing spots', () => {
    const paid = { ...existing(), spots: [{ name: 'A', capacity: 8, price: 600 }] };
    const set = buildComposerUpdate({ registrationMode: 'paid_ticket' }, paid);
    expect(set['capacity.total']).toBe(8);
    expect(set.ticketPrice).toBe(600);
  });

  it('no-spot event → a direct capacity edit still updates maxParticipants', () => {
    const noSpots = { ...existing(), spots: [] };
    const set = buildComposerUpdate({ about: 'x', capacity: { total: 40 } }, noSpots);
    expect(set['capacity.total']).toBe(40);
    expect(set.maxParticipants).toBe(40);
  });
});

describe('buildComposerUpdate — location merge & door', () => {
  it('merges location without clobbering unspecified fields', () => {
    const set = buildComposerUpdate({ location: { kind: 'in_person', venueName: 'New Studio' } }, existing());
    expect(set.location.venueName).toBe('New Studio'); // changed
    expect(set.location.city).toBe('Pune');            // preserved
    expect(set.location.address).toBe('FC Road');      // preserved
    expect(set.location.type).toBe('physical');
  });

  it('switching to online flips location.type', () => {
    const set = buildComposerUpdate({ location: { kind: 'online', onlinePlatform: 'Zoom' } }, existing());
    expect(set.location.type).toBe('online');
    expect(set.location.city).toBe('Pune'); // still merged from existing
  });

  it('door change re-derives requiresApproval', () => {
    const open = buildComposerUpdate({ registration: { door: 'open', questions: [] } }, existing());
    expect(open.requiresApproval).toBe(false);
    const apply = buildComposerUpdate({ registration: { door: 'apply', questions: [{ label: 'Reel', type: 'link' }] } }, existing());
    expect(apply.requiresApproval).toBe(true);
    expect(apply.registration.questions).toHaveLength(1);
  });
});

describe('buildComposerUpdate — schedule recompute', () => {
  it('a new date recomputes schedule from durationKind', () => {
    const set = buildComposerUpdate({ startsAt: '2026-12-01T10:00:00.000Z', durationKind: 'h3' }, existing());
    expect(set.schedule.totalDurationMinutes).toBe(180);
    expect(new Date(set.schedule.startDate).toISOString()).toBe('2026-12-01T10:00:00.000Z');
    expect(new Date(set.schedule.endDate).getTime()).toBe(new Date('2026-12-01T10:00:00.000Z').getTime() + 180 * 60000);
    expect(set.schedule.dayBreakdown).toHaveLength(1); // preserved from existing
  });

  it('an explicit endsAt wins and recomputes the duration', () => {
    const set = buildComposerUpdate({ startsAt: '2026-12-01T10:00:00.000Z', endsAt: '2026-12-01T13:30:00.000Z' }, existing());
    expect(set.schedule.totalDurationMinutes).toBe(210);
  });

  it('changing only durationKind reuses the existing startsAt', () => {
    const set = buildComposerUpdate({ durationKind: 'h1' }, existing());
    expect(new Date(set.schedule.startDate).toISOString()).toBe('2026-11-14T13:00:00.000Z');
    expect(set.schedule.totalDurationMinutes).toBe(60);
  });
});
