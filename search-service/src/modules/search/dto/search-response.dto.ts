/**
 * Generic item structure for search results.
 * This ensures consistency across different verticals (People, Gigs, Events).
 */
export interface SearchResultItemDTO {
    id: string;
    type: 'people' | 'gig' | 'event';

    /**
     * Main display title (e.g., Name of person, Title of gig, Name of event)
     */
    title: string;

    /**
     * Secondary text (e.g., "Dancer • Bangalore", "₹5k-10k • Remote")
     */
    subtitle?: string;

    /**
     * URL to image/avatar
     */
    image?: string;

    /**
     * Relevance score from the search engine
     */
    score?: number;

    /**
     * Additional vertical-specific data
     */
    metadata?: Record<string, any>;

    /**
     * Full raw document from the database (optional)
     * Useful when the client needs the full object details immediately
     */
    raw?: any;
}

export interface SearchResponseDTO<T = SearchResultItemDTO> {
    results: T[];
    meta: {
        page: number;
        pageSize: number;
        total: number;
        /**
         * Server-side latency in milliseconds
         */
        latencyMs?: number;
    };
}

export interface EventSearchResultDTO extends SearchResultItemDTO {
    coverImage?: string;
    ticketPrice?: number;
    eventType?: string;
    attendeesCount?: number;
    rating?: number;
    schedule?: any;
    location?: any;
}
