import { Types } from 'mongoose';
import { resolveSpot, EventSpot } from '../utils/eventSpots';

const spot = (over: Partial<EventSpot> = {}): EventSpot => ({
  _id: new Types.ObjectId(), name: 'General', capacity: 10, price: 0, ...over,
});

describe('resolveSpot (pure)', () => {
  it('returns {} for a spot-less event (legacy / event-level pricing)', () => {
    expect(resolveSpot({ spots: [] }, undefined)).toEqual({});
    expect(resolveSpot({}, 'anything')).toEqual({});
    expect(resolveSpot(null, 'x')).toEqual({});
  });

  it('defaults to the sole spot when one exists and none is given', () => {
    const s = spot();
    const r = resolveSpot({ spots: [s] }, undefined);
    expect(String(r.spot?._id)).toBe(String(s._id));
    expect(r.requiresPayment).toBe(false);
  });

  it('flags requiresPayment when the resolved spot has a price', () => {
    expect(resolveSpot({ spots: [spot({ price: 500 })] }, undefined).requiresPayment).toBe(true);
  });

  it('errors when a multi-spot event is given no spotId', () => {
    const r = resolveSpot({ spots: [spot(), spot({ name: 'VIP' })] }, undefined);
    expect(r.spot).toBeUndefined();
    expect(r.error).toMatch(/spotId is required/);
  });

  it('resolves the chosen spotId among many', () => {
    const a = spot({ name: 'A' });
    const b = spot({ name: 'B', price: 300 });
    const r = resolveSpot({ spots: [a, b] }, String(b._id));
    expect(r.spot?.name).toBe('B');
    expect(r.requiresPayment).toBe(true);
  });

  it('errors on an unknown spotId', () => {
    const r = resolveSpot({ spots: [spot()] }, String(new Types.ObjectId()));
    expect(r.error).toMatch(/Unknown spot/);
  });
});
