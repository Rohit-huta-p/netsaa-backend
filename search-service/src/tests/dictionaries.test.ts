import { CRAFT_DICT, EVENT_TYPE_DICT, GIG_TYPE_DICT, CITY_DICT, MONTH_DICT } from '../intent/dictionaries';

describe('dictionaries', () => {
  it('craft has core entries', () => {
    expect(CRAFT_DICT.has('kathak')).toBe(true);
    expect(CRAFT_DICT.has('bollywood')).toBe(true);
    expect(CRAFT_DICT.has('vocals')).toBe(true);
  });
  it('event-type', () => {
    expect(EVENT_TYPE_DICT.has('workshop')).toBe(true);
    expect(EVENT_TYPE_DICT.has('audition')).toBe(true);
  });
  it('gig-type', () => {
    expect(GIG_TYPE_DICT.has('sangeet')).toBe(true);
    expect(GIG_TYPE_DICT.has('wedding')).toBe(true);
  });
  it('city includes Pune', () => {
    expect(CITY_DICT.has('pune')).toBe(true);
    expect(CITY_DICT.has('mumbai')).toBe(true);
  });
  it('month covers all 12', () => {
    expect(MONTH_DICT.size).toBeGreaterThanOrEqual(12);
    expect(MONTH_DICT.has('mar')).toBe(true);
  });
});
