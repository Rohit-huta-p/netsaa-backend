import { classifyIntent } from '../intent/classifier';

describe('classifyIntent', () => {
  it('"kathak pune" → people-first via craft + city', () => {
    const r = classifyIntent('kathak pune');
    expect(r.dominantVertical).toBe('people');
    expect(r.extracted.crafts).toContain('kathak');
    expect(r.extracted.cities).toContain('pune');
  });

  it('"sangeet march pune" → gigs-first', () => {
    const r = classifyIntent('sangeet march pune');
    expect(r.dominantVertical).toBe('gigs');
    expect(r.scores.gigs).toBeGreaterThan(r.scores.people);
    expect(r.confidence).toBeGreaterThan(0.6);
  });

  it('"kathak workshop" → events-first', () => {
    const r = classifyIntent('kathak workshop');
    expect(r.dominantVertical).toBe('events');
  });

  it('"Priya Sharma" → people-first via name signal', () => {
    const r = classifyIntent('Priya Sharma');
    expect(r.dominantVertical).toBe('people');
    expect(r.extracted.names).toEqual(['Priya', 'Sharma']);
  });

  it('"dance" alone → ambiguous, default people order', () => {
    const r = classifyIntent('dance');
    expect(r.dominantVertical).toBe('people');
    expect(r.confidence).toBeLessThanOrEqual(1);
  });

  it('empty query → all-zero scores, default people-first', () => {
    const r = classifyIntent('');
    expect(r.scores).toEqual({ people: 0, gigs: 0, events: 0 });
    expect(r.dominantVertical).toBe('people');
    expect(r.confidence).toBe(0);
  });
});
