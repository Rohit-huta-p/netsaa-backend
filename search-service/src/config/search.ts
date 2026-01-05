export const SEARCH_CONFIG = {
    // Pagination
    DEFAULT_PAGE_SIZE: 10,
    MAX_PAGE_SIZE: 50,

    // Timeouts & Latency Targets (SLOs)
    TIMEOUT_MS: 5000,
    SLO_SEARCH_P95_MS: 250,
    SLO_PREVIEW_P95_MS: 200,

    // Caching
    CACHE_TTL_SECONDS: 30, // 30s cache for client/previews

    // Indexing
    INDEX_FRESHNESS_TARGET_SECONDS: 5,
};
