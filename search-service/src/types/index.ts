/**
 * Common shared types for the Search Service.
 */

export type EntityId = string;

export interface PaginationParams {
    page: number;
    pageSize: number;
}

export interface PaginatedResult<T> {
    results: T[];
    total: number;
}

export interface SearchFilters {
    [key: string]: any;
}
