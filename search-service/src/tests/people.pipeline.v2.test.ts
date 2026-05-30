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

  it('adds self-exclusion mustNot when viewer._id present', () => {
    const pipeline = buildPeoplePipelineV2({
      query: '',
      filters: {},
      limit: 10,
      skip: 0,
      viewer: { _id: 'v1', graph: { collaboratorIds: [], degree1ConnectionIds: [], pymkTopIds: [] } },
    });
    const search = (pipeline[0] as any).$search;
    const hasSelfExcl = search.compound.mustNot?.some((m: any) => m.equals?.path === '_id');
    expect(hasSelfExcl).toBe(true);
  });

  it('omits self-exclusion when viewer._id absent', () => {
    const pipeline = buildPeoplePipelineV2({
      query: '',
      filters: {},
      limit: 10,
      skip: 0,
      viewer: { graph: { collaboratorIds: [], degree1ConnectionIds: [], pymkTopIds: [] } },
    });
    const search = (pipeline[0] as any).$search;
    const hasSelfExcl = search.compound.mustNot?.some((m: any) => m.equals?.path === '_id');
    expect(hasSelfExcl).toBe(false);
  });
});
