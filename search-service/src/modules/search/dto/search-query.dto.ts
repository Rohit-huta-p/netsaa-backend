export interface SearchQueryDTO {
    /**
     * The search query string.
     */
    q?: string;

    /**
     * Page number (1-based).
     * @default 1
     */
    page?: number;

    /**
     * Number of items per page.
     * @default 10
     */
    pageSize?: number;

    /**
     * various filters like city, type, date range etc.
     * These are usually extracted from query params excluding q, page, pageSize.
     */
    filters?: Record<string, any>;
}
