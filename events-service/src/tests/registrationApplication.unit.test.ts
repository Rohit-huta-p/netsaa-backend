import { buildApplication } from '../utils/registrationApplication';

describe('buildApplication (pure)', () => {
  it('returns undefined for a non-object or empty payload', () => {
    expect(buildApplication(undefined)).toBeUndefined();
    expect(buildApplication(null)).toBeUndefined();
    expect(buildApplication('nope')).toBeUndefined();
    expect(buildApplication({})).toBeUndefined();
    expect(buildApplication({ pitch: '   ', links: [], mediaIds: [] })).toBeUndefined();
  });

  it('keeps a trimmed pitch', () => {
    expect(buildApplication({ pitch: '  I have 8 years on stage  ' })).toEqual({ pitch: 'I have 8 years on stage' });
  });

  it('trims + drops empties in links and mediaIds', () => {
    const r = buildApplication({ links: ['https://reel ', '', '  '], mediaIds: ['m1', ' ', 'm2'] });
    expect(r).toEqual({ links: ['https://reel'], mediaIds: ['m1', 'm2'] });
  });

  it('caps links at 10 and mediaIds at 20', () => {
    const r = buildApplication({
      links: Array.from({ length: 15 }, (_, i) => `l${i}`),
      mediaIds: Array.from({ length: 25 }, (_, i) => `m${i}`),
    });
    expect(r?.links).toHaveLength(10);
    expect(r?.mediaIds).toHaveLength(20);
  });
});
