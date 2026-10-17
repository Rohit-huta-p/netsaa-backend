/**
 * Pure unit tests for stable spot ids + offer→spot linking (no DB).
 */
import { Types } from 'mongoose';
import { buildSpots, cleanOffers, mapComposerToEventDoc, buildComposerUpdate } from '../services/composerMapping';

const USER = { id: 'u1', name: 'Rohit', organizationName: 'NETSA' };
const UID = '507f1f77bcf86cd799439011';

const base = (over: any = {}) => ({
  eventType: 'workshop', title: 'Kathak Foundations', about: 'A hands-on morning.',
  registrationMode: 'free_rsvp', startsAt: '2026-11-14T13:00:00.000Z', durationKind: 'h2',
  location: { kind: 'in_person', city: 'Pune' },
  spots: [{ name: 'Dancer', capacity: 20, price: 0 }],
  registration: { door: 'open', questions: [] }, visibility: 'public', ...over,
});

describe('buildSpots — stable ids', () => {
  it('gives every spot a real ObjectId _id and maps its client ref', () => {
    const { spots, refToId } = buildSpots([{ clientId: 'spot-0', name: 'A', capacity: 5, price: 0 }]);
    expect(spots[0]._id).toBeInstanceOf(Types.ObjectId);
    expect(refToId.get('spot-0')!.toString()).toBe(spots[0]._id.toString());
  });

  it('preserves an existing ObjectId ref as the _id (edit stability, no churn)', () => {
    const existing = new Types.ObjectId().toString();
    const { spots, refToId } = buildSpots([{ clientId: existing, name: 'A', capacity: 5, price: 0 }]);
    expect(spots[0]._id.toString()).toBe(existing);
    expect(refToId.get(existing)!.toString()).toBe(existing);
  });

  it('drops nameless spots', () => {
    expect(buildSpots([{ name: '  ', capacity: 1, price: 0 }, { clientId: 'x', name: 'Real', capacity: 2, price: 0 }]).spots).toHaveLength(1);
  });
});

describe('cleanOffers — spot resolution', () => {
  it('resolves an offer client ref to the picked spot _id', () => {
    const id = new Types.ObjectId();
    const map = new Map([['spot-1', id]]);
    expect(cleanOffers([{ name: 'Early', price: 700, audience: 'everyone', spotId: 'spot-1' }], map)[0].spotId.toString()).toBe(id.toString());
  });
  it('leaves spotId undefined when the ref matches no spot', () => {
    expect(cleanOffers([{ name: 'Early', price: 700, audience: 'everyone', spotId: 'nope' }], new Map())[0].spotId).toBeUndefined();
  });
});

describe('create — offer links to the spot the host picked', () => {
  it('offer.spotId === the created spot _id (by composer client ref)', () => {
    const { doc } = mapComposerToEventDoc(base({
      registrationMode: 'paid_ticket',
      spots: [{ clientId: 'spot-A', name: 'Front', capacity: 10, price: 1500 }, { clientId: 'spot-B', name: 'Back', capacity: 20, price: 800 }],
      offers: [{ name: 'Early', price: 1200, audience: 'everyone', spotId: 'spot-B' }],
    }), USER, UID);
    const back = doc.spots.find((s: any) => s.name === 'Back');
    expect(doc.offers[0].spotId.toString()).toBe(back._id.toString());
  });
});

describe('edit (PATCH) — spot id preserved + offer re-linked', () => {
  it('re-sending a spot by its existing _id keeps the _id and links the offer', () => {
    const spotId = new Types.ObjectId().toString();
    const existing = { registrationMode: 'paid_ticket', spots: [{ _id: spotId, name: 'Front', capacity: 10, price: 1500 }], ticketPrice: 1500 };
    const set = buildComposerUpdate({
      registrationMode: 'paid_ticket',
      spots: [{ clientId: spotId, name: 'Front', capacity: 12, price: 1500 }], // capacity edited, same spot
      offers: [{ name: 'Early', price: 1200, audience: 'everyone', spotId }],
    }, existing);
    expect(set.spots[0]._id.toString()).toBe(spotId);     // no churn
    expect(set.offers[0].spotId.toString()).toBe(spotId); // offer still linked
    expect(set['capacity.total']).toBe(12);
  });
});
