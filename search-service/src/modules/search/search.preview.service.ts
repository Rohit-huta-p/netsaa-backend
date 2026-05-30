import { searchService } from './search.service';
import { classifyIntent } from '../../intent/classifier';
import type { IntentResult, Vertical } from '../../types/search.types';

const TYPEAHEAD_LIMITS: Record<Vertical, number> = { people: 3, gigs: 2, events: 1 };
const PREVIEW_LIMITS: Record<Vertical, number>   = { people: 5, gigs: 5, events: 5 };
const CONFIDENCE_REORDER_THRESHOLD = 0.60;

export interface PreviewOptions {
  mode?: 'preview' | 'typeahead';
  viewerId?: string;
}

export class SearchPreviewService {
  /**
   * Executes a preview search across all verticals concurrently.
   * Supports 'preview' mode (top 5 per vertical) and 'typeahead' mode (3/2/1).
   * Reorders rails by intent dominance when confidence >= 0.60.
   * Passes viewerId to searchPeople for graph-aware ranking.
   */
  async executePreview(query: string, opts: PreviewOptions = {}) {
    const mode = opts.mode ?? 'preview';
    const limits = mode === 'typeahead' ? TYPEAHEAD_LIMITS : PREVIEW_LIMITS;

    const intent: IntentResult = classifyIntent(query);

    const [people, gigs, events] = await Promise.all([
      searchService.searchPeople(query, {}, 1, opts.viewerId),
      searchService.searchGigs(query, {}, 1),
      searchService.searchEvents(query, {}, 1),
    ]);

    const order: Vertical[] = ['people', 'gigs', 'events'];
    if (intent.confidence >= CONFIDENCE_REORDER_THRESHOLD) {
      order.sort((a, b) => intent.scores[b] - intent.scores[a]);
    }

    return {
      people: people.results.slice(0, limits.people),
      gigs:   gigs.results.slice(0, limits.gigs),
      events: events.results.slice(0, limits.events),
      intent,
      order,
      mode,
    };
  }
}

export const searchPreviewService = new SearchPreviewService();
