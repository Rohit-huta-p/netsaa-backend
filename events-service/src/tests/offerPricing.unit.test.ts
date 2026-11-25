import { Types } from 'mongoose';
import { resolveEffectivePrice } from '../services/offerPricing';

const spotId = new Types.ObjectId();
const base = { ticketPrice: 1500 };
const now = new Date('2026-11-05T00:00:00Z');
const future = new Date('2026-11-10T00:00:00Z');
const past = new Date('2026-11-01T00:00:00Z');

describe('resolveEffectivePrice', () => {
  it('returns base price when there are no offers', () => {
    const r = resolveEffectivePrice(base, { seats: 1, now });
    expect(r.unitRupees).toBe(1500);
    expect(r.appliedOffer).toBeUndefined();
  });

  it('applies an active early-bird (everyone)', () => {
    const r = resolveEffectivePrice(
      { ...base, offers: [{ name: 'Early bird', price: 1200, audience: 'everyone', endsAt: future }] },
      { seats: 1, now },
    );
    expect(r.unitRupees).toBe(1200);
    expect(r.appliedOffer).toMatchObject({ name: 'Early bird', unitRupees: 1200, baseUnitRupees: 1500 });
  });

  it('ignores an expired offer', () => {
    const r = resolveEffectivePrice(
      { ...base, offers: [{ name: 'Early bird', price: 1200, audience: 'everyone', endsAt: past }] },
      { seats: 1, now },
    );
    expect(r.unitRupees).toBe(1500);
    expect(r.appliedOffer).toBeUndefined();
  });

  it('a group offer needs minSeats', () => {
    const offers = [{ name: 'Group 4+', price: 1000, audience: 'group' as const, minSeats: 4 }];
    expect(resolveEffectivePrice({ ...base, offers }, { seats: 2, now }).unitRupees).toBe(1500);
    expect(resolveEffectivePrice({ ...base, offers }, { seats: 4, now }).unitRupees).toBe(1000);
  });

  it('picks the cheapest qualifying offer (group beats early-bird at size)', () => {
    const offers = [
      { name: 'Early bird', price: 1200, audience: 'everyone' as const, endsAt: future },
      { name: 'Group 4+', price: 1000, audience: 'group' as const, minSeats: 4 },
    ];
    expect(resolveEffectivePrice({ ...base, offers }, { seats: 1, now }).appliedOffer?.name).toBe('Early bird');
    expect(resolveEffectivePrice({ ...base, offers }, { seats: 4, now }).appliedOffer?.name).toBe('Group 4+');
  });

  it('a spot-scoped offer applies only to that spot', () => {
    const event = {
      spots: [{ _id: spotId, price: 2000 }, { _id: new Types.ObjectId(), price: 1500 }],
      offers: [{ spotId, name: 'VIP early', price: 1600, audience: 'everyone' as const, endsAt: future }],
    };
    expect(resolveEffectivePrice(event, { spotId, seats: 1, now }).unitRupees).toBe(1600);
    // a different spot doesn't get the VIP offer
    expect(resolveEffectivePrice(event, { spotId: event.spots[1]._id, seats: 1, now }).unitRupees).toBe(1500);
  });

  it('respects seatLimit when a usage map is supplied', () => {
    const offers = [{ name: 'First 20', price: 1200, audience: 'everyone' as const, seatLimit: 20 }];
    // 18 used + 1 = 19 ≤ 20 → applies
    expect(resolveEffectivePrice({ ...base, offers }, { seats: 1, now, seatsUsedByOffer: { 'First 20': 18 } }).unitRupees).toBe(1200);
    // 20 used + 1 > 20 → exhausted, base price
    expect(resolveEffectivePrice({ ...base, offers }, { seats: 1, now, seatsUsedByOffer: { 'First 20': 20 } }).unitRupees).toBe(1500);
  });

  it('never discounts a free tier, and ignores a non-cheaper offer', () => {
    expect(resolveEffectivePrice({ ticketPrice: 0, offers: [{ name: 'x', price: 0, audience: 'everyone' }] }, { seats: 1, now }).unitRupees).toBe(0);
    expect(resolveEffectivePrice({ ...base, offers: [{ name: 'x', price: 1500, audience: 'everyone' }] }, { seats: 1, now }).appliedOffer).toBeUndefined();
  });
});
