import { buildPeopleVisibility } from '../../permissions/people.visibility';

/**
 * Builds the Atlas Search filter clauses based on input DTO filters.
 */
export const buildPeopleFilters = (filters: Record<string, any>) => {
    const must: any[] = [];
    const should: any[] = [];

    // Get Mandatory Visibility Rules
    const { filter: visibilityFilter, mustNot: visibilityMustNot } = buildPeopleVisibility();

    const filter = [...visibilityFilter];
    const mustNot = [...(visibilityMustNot || [])];

    // --- User Filters ---

    // Craft (artistType) — single value or multi-select. Accepts `artistTypes`
    // (array, preferred) or `artistType` (string | array). A `text` query that
    // is an array gives case-insensitive OR semantics across the crafts.
    const craftRaw: any = (filters as any).artistTypes ?? filters.artistType;
    const crafts: string[] = (Array.isArray(craftRaw) ? craftRaw : craftRaw != null ? [craftRaw] : [])
        .map((c: any) => String(c).trim())
        .filter(Boolean);
    if (crafts.length > 0) {
        must.push({
            text: {
                query: crafts,
                path: 'artistType',
            },
        });
    }

    // City
    if (filters.city) {
        must.push({
            text: {
                query: filters.city,
                path: 'city',
            },
        });
    }

    // Rating
    if (filters.rating) {
        filter.push({
            range: {
                path: 'rating',
                gte: Number(filters.rating),
            },
        });
    }

    return { must, should, filter, mustNot };
};
