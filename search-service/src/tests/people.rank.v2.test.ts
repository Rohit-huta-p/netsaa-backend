import { buildPeopleRankingClausesV2 } from '../ranking/people.rank.v2';

describe('buildPeopleRankingClausesV2', () => {
  it('returns query SHOULD clauses for displayName/artistType/skills/city/bio when query present', () => {
    const c = buildPeopleRankingClausesV2('kathak pune', {
      collaboratorIds: [], degree1ConnectionIds: [], pymkTopIds: [],
    });
    const paths = c.map((cl: any) => {
      if (cl.autocomplete) return cl.autocomplete.path;
      if (cl.text) return Array.isArray(cl.text.path) ? cl.text.path.join(',') : cl.text.path;
      if (cl.range) return `range:${cl.range.path}`;
      if (cl.near) return `near:${cl.near.path}`;
      if (cl.in) return `in:${cl.in.path}`;
      return 'unknown';
    });
    expect(paths).toContain('displayName');
    expect(paths).toContain('artistType');
    expect(paths).toContain('skills');
    expect(paths).toContain('cached.primaryCity');
    expect(paths).toContain('bio');
    expect(paths).toContain('range:cached.averageRating');
    expect(paths).toContain('range:cached.connectionStats.degree1Count');
    expect(paths).toContain('near:lastActiveAt');
  });

  it('adds graph IN clauses when viewer has graph data', () => {
    const c = buildPeopleRankingClausesV2('', {
      collaboratorIds: ['a'], degree1ConnectionIds: ['b'], pymkTopIds: ['c'],
    });
    const inClauses = c.filter((cl: any) => cl.in);
    expect(inClauses).toHaveLength(3);
  });

  it('omits graph clauses when arrays empty', () => {
    const c = buildPeopleRankingClausesV2('', {
      collaboratorIds: [], degree1ConnectionIds: [], pymkTopIds: [],
    });
    expect(c.filter((cl: any) => cl.in)).toHaveLength(0);
  });

  it('returns only soft signals when query is empty', () => {
    const c = buildPeopleRankingClausesV2('', {
      collaboratorIds: [], degree1ConnectionIds: [], pymkTopIds: [],
    });
    expect(c.find((cl: any) => cl.autocomplete)).toBeUndefined();
  });
});
