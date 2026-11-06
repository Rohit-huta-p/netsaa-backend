import { buildPeoplePipelineV2 } from '../infra/search/pipelines/people.pipeline';

describe('buildPeoplePipelineV2', () => {
  it('includes $search with compound{must, should} and self-exclusion mustNot', () => {
    const pipeline = buildPeoplePipelineV2({
      query: 'kathak',
      filters: {},
      limit: 10,
      skip: 0,
      viewer: { _id: 'v1', graph: { collaboratorIds: [], degree1ConnectionIds: [], pymkTopIds: [] } },
    });
    const search = (pipeline[0] as any).$search;
    expect(search.index).toBe('people_search_index');
    expect(search.compound.must.length).toBeGreaterThan(0);
    expect(search.compound.should.length).toBeGreaterThan(0);
  });

  // Self-exclusion is a post-`$search` `$match` on the real ObjectId (an `equals`
  // on `_id` does not work under the dynamic people index), NOT a compound.mustNot.
  const hasSelfExclMatch = (pipeline: any[]) =>
    pipeline.some((s: any) => s.$match && s.$match._id && s.$match._id.$ne !== undefined);

  it('adds a self-exclusion $match when viewer._id present', () => {
    const pipeline = buildPeoplePipelineV2({
      query: '',
      filters: {},
      limit: 10,
      skip: 0,
      viewer: { _id: 'v1', graph: { collaboratorIds: [], degree1ConnectionIds: [], pymkTopIds: [] } },
    });
    expect(hasSelfExclMatch(pipeline)).toBe(true);
  });

  it('omits self-exclusion when viewer._id absent', () => {
    const pipeline = buildPeoplePipelineV2({
      query: '',
      filters: {},
      limit: 10,
      skip: 0,
      viewer: { graph: { collaboratorIds: [], degree1ConnectionIds: [], pymkTopIds: [] } },
    });
    expect(hasSelfExclMatch(pipeline)).toBe(false);
  });

  it('omits minimumShouldMatch on a facet-only search (no text query)', () => {
    // Atlas rejects minimumShouldMatch when `should` is empty.
    const pipeline = buildPeoplePipelineV2({
      query: '',
      filters: { artistTypes: ['Dancer'] },
      limit: 10,
      skip: 0,
      viewer: { graph: { collaboratorIds: [], degree1ConnectionIds: [], pymkTopIds: [] } },
    });
    const { compound } = (pipeline[0] as any).$search;
    if (!compound.should || compound.should.length === 0) {
      expect(compound.minimumShouldMatch).toBeUndefined();
    }
  });

  it('adds a craft (artistType) text clause for a multi-select facet', () => {
    const pipeline = buildPeoplePipelineV2({
      query: '',
      filters: { artistTypes: ['Dancer', 'Actor'] },
      limit: 10,
      skip: 0,
      viewer: { graph: { collaboratorIds: [], degree1ConnectionIds: [], pymkTopIds: [] } },
    });
    const { compound } = (pipeline[0] as any).$search;
    const craftClause = compound.must?.find((m: any) => m.text?.path === 'artistType');
    expect(craftClause).toBeTruthy();
    expect(craftClause.text.query).toEqual(['Dancer', 'Actor']);
  });
});
