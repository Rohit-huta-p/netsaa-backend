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
