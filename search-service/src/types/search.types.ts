export type Vertical = 'people' | 'gigs' | 'events';

export interface IntentResult {
  scores: Record<Vertical, number>;
  dominantVertical: Vertical;
  confidence: number;
  extracted: {
    crafts: string[];
    cities: string[];
    months: string[];
    names: string[];
  };
}

export interface PymkItem {
  artistId: string;
  score: number;
  reasons: string[];
  mutualCount: number;
  craftOverlap: number;
}

export interface SimilarItem {
  peerId: string;
  score: number;
  reasons: string[];
  craftOverlap: number;
  skillOverlap: number;
  cityMatch: boolean;
}

export interface RankWeights {
  NAME_MATCH: number;
  ARTIST_TYPE_MATCH: number;
  SKILLS_MATCH: number;
  CITY_MATCH: number;
  BIO_MATCH: number;
  GRAPH_COLLAB: number;
  GRAPH_DEGREE1: number;
  GRAPH_PYMK: number;
  RATING_BOOST: number;
  POPULARITY_BOOST: number;
  ACTIVITY_BOOST: number;
}
