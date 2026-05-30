export interface SearchMetricPayload {
  surface: 'preview' | 'vertical';
  query: string;
  viewerId?: string;
  latencyMs: number;
  resultCounts: { people: number; gigs: number; events: number };
  intent: { dominantVertical: 'people' | 'gigs' | 'events'; confidence: number };
}

export interface PymkMetricPayload {
  viewerId: string;
  latencyMs: number;
  strategy: 'graph' | 'contacts' | 'craft-city';
  total: number;
  page: number;
  fallback: boolean;
}

export interface SimilarMetricPayload {
  artistId: string;
  latencyMs: number;
  mode: 'rail' | 'page';
  total: number;
  fallback: boolean;
}

function emit(payload: Record<string, any>) {
  // Structured stdout. Log aggregator (CloudWatch/Grafana) picks up via stdout pipeline.
  console.log(JSON.stringify({ ts: new Date().toISOString(), ...payload }));
}

export function emitSearchMetric(p: SearchMetricPayload): void {
  emit({ metric: 'search', ...p });
}

export function emitPymkMetric(p: PymkMetricPayload): void {
  emit({ metric: 'pymk', ...p });
}

export function emitSimilarMetric(p: SimilarMetricPayload): void {
  emit({ metric: 'similar', ...p });
}
