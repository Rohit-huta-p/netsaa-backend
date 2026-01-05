import { searchService } from './search.service';
import { SEARCH_CONFIG } from '../../config';

export class SearchPreviewService {
    /**
     * Executes a preview search across all verticals concurrently.
     * This is used for the "As-you-type" experience.
     */
    async executePreview(query: string) {
        // In preview, we typically fetch a smaller subset (e.g., top 3-5) from each vertical.
        // For now, we reuse the main search methods but we might want to pass a 'preview' flag or smaller page size limit later.

        // Concurrently fetch results from all verticals
        const [people, gigs, events] = await Promise.all([
            searchService.searchPeople(query, {}, 1),
            searchService.searchGigs(query, {}, 1),
            searchService.searchEvents(query, {}, 1),
        ]);

        // TODO: Implement intent classification to re-order or filter these sections if needed (Phase 2)

        return {
            people: people.results.slice(0, 5), // Limit to top 5 for preview
            gigs: gigs.results.slice(0, 5),
            events: events.results.slice(0, 5),
        };
    }
}

export const searchPreviewService = new SearchPreviewService();
