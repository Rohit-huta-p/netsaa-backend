import { PEOPLE_WEIGHTS_V2 } from '../ranking/weights';

describe('PEOPLE_WEIGHTS_V2', () => {
  it('has all required weights with sensible values', () => {
    expect(PEOPLE_WEIGHTS_V2.NAME_MATCH).toBe(3.0);
    expect(PEOPLE_WEIGHTS_V2.ARTIST_TYPE_MATCH).toBe(2.5);
    expect(PEOPLE_WEIGHTS_V2.SKILLS_MATCH).toBe(2.0);
    expect(PEOPLE_WEIGHTS_V2.CITY_MATCH).toBe(1.5);
    expect(PEOPLE_WEIGHTS_V2.BIO_MATCH).toBe(1.0);
    expect(PEOPLE_WEIGHTS_V2.GRAPH_COLLAB).toBe(2.5);
    expect(PEOPLE_WEIGHTS_V2.GRAPH_DEGREE1).toBe(2.0);
    expect(PEOPLE_WEIGHTS_V2.GRAPH_PYMK).toBe(1.8);
    expect(PEOPLE_WEIGHTS_V2.RATING_BOOST).toBe(1.3);
    expect(PEOPLE_WEIGHTS_V2.POPULARITY_BOOST).toBe(1.2);
    expect(PEOPLE_WEIGHTS_V2.ACTIVITY_BOOST).toBe(1.5);
  });
});
