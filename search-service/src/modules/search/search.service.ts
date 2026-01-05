import { SEARCH_CONFIG } from '../../config';
import { searchPeopleInDb } from '../people/people.search';

import { searchGigsInDb } from '../gigs/gigs.search';
import { searchEventsInDb } from '../events/events.search';

export class SearchService {
    /**
     * Orchestrates the search for People (Artists & Organizers).
     */
    async searchPeople(query: string, filters: any, page: number = 1, userId?: string) {
        const { results, total } = await searchPeopleInDb(query, filters, page, SEARCH_CONFIG.DEFAULT_PAGE_SIZE, userId);

        return {
            results,
            meta: {
                page,
                pageSize: SEARCH_CONFIG.DEFAULT_PAGE_SIZE,
                total,
            },
        };
    }

    /**
     * Orchestrates the search for Gigs.
     */
    async searchGigs(query: string, filters: any, page: number = 1) {
        const { results, total } = await searchGigsInDb(query, filters, page, SEARCH_CONFIG.DEFAULT_PAGE_SIZE);

        return {
            results,
            meta: {
                page,
                pageSize: SEARCH_CONFIG.DEFAULT_PAGE_SIZE,
                total,
            },
        };
    }

    /**
     * Orchestrates the search for Events.
     */
    async searchEvents(query: string, filters: any, page: number = 1) {
        const { results, total } = await searchEventsInDb(query, filters, page, SEARCH_CONFIG.DEFAULT_PAGE_SIZE);

        return {
            results,
            meta: {
                page,
                pageSize: SEARCH_CONFIG.DEFAULT_PAGE_SIZE,
                total,
            },
        };
    }
}

export const searchService = new SearchService();
