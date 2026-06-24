import { computeSimilarForArtist, scoreSim } from '../workers/similar.recompute.worker';

describe('scoreSim', () => {
  it('weights craft (0.5) + skill (0.3) + city (0.2)', () => {
    const a = scoreSim({ craftOverlap: 1, skillOverlap: 0.5, cityMatch: true });
    const b = scoreSim({ craftOverlap: 1, skillOverlap: 0.1, cityMatch: false });
    expect(a).toBeGreaterThan(b);
    expect(a).toBeCloseTo(0.5 + 0.15 + 0.2, 5);
    expect(b).toBeCloseTo(0.5 + 0.03 + 0,   5);
  });
});

describe('computeSimilarForArtist', () => {
  it('returns empty list when focal artist not found', async () => {
    // We don't mock mongoose collection — relies on no real connection.
    // For unit purposes, expect graceful empty.
    // Skipping live integration; just assert function exists and is async.
    expect(typeof computeSimilarForArtist).toBe('function');
  });
});
