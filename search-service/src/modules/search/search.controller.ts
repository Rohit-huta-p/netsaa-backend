import { Request, Response, NextFunction } from 'express';
import { searchService } from './search.service';
import { searchPreviewService } from './search.preview.service';
import { SEARCH_CONFIG } from '../../config';

/**
 * Flattens the nested frontend filter structure to flat structure.
 * 
 * Frontend sends:
 * { advanced: { compensation: { minCompensation: 5000 }, artistType: { types: [...] } } }
 * 
 * Backend expects:
 * { minCompensation: 5000, artistTypes: [...] }
 */
function flattenGigFilters(nestedFilters: Record<string, any>): Record<string, any> {
    const flat: Record<string, any> = {};

    // Handle direct flat filters (backward compatibility)
    const directFields = ['minCompensation', 'artistTypes', 'experienceLevel', 'gigType',
        'category', 'city', 'remoteOnly', 'compensationModel',
        'applicationDeadline', 'perks', 'excludeUnpaid', 'urgent',
        'featured', 'higherPay', 'deadlineSoon', 'sortMode', 'sortBy'];

    for (const field of directFields) {
        if (nestedFilters[field] !== undefined && nestedFilters[field] !== null) {
            flat[field] = nestedFilters[field];
        }
    }

    // Handle nested advanced structure
    if (nestedFilters.advanced && typeof nestedFilters.advanced === 'object') {
        const adv = nestedFilters.advanced;

        // compensation: { minCompensation, excludeUnpaid, compensationModel }
        if (adv.compensation) {
            if (adv.compensation.minCompensation) flat.minCompensation = adv.compensation.minCompensation;
            if (adv.compensation.excludeUnpaid) flat.excludeUnpaid = adv.compensation.excludeUnpaid;
            if (adv.compensation.compensationModel) flat.compensationModel = adv.compensation.compensationModel;
        }

        // artistType: { types: [...] } or { artistTypes: [...] }
        if (adv.artistType) {
            if (Array.isArray(adv.artistType.types) && adv.artistType.types.length > 0) {
                flat.artistTypes = adv.artistType.types;
            } else if (Array.isArray(adv.artistType.artistTypes) && adv.artistType.artistTypes.length > 0) {
                flat.artistTypes = adv.artistType.artistTypes;
            }
        }

        // experience: { levels: [...] } or { experienceLevel: [...] }
        if (adv.experience) {
            if (Array.isArray(adv.experience.levels) && adv.experience.levels.length > 0) {
                flat.experienceLevel = adv.experience.levels;
            } else if (Array.isArray(adv.experience.experienceLevel) && adv.experience.experienceLevel.length > 0) {
                flat.experienceLevel = adv.experience.experienceLevel;
            }
        }

        // location: { city, remoteOnly }
        if (adv.location) {
            if (adv.location.city) flat.city = adv.location.city;
            if (adv.location.remoteOnly) flat.remoteOnly = adv.location.remoteOnly;
        }

        // eventType: { types: [...] } or { gigType: [...] }
        if (adv.eventType) {
            if (Array.isArray(adv.eventType.types) && adv.eventType.types.length > 0) {
                flat.gigType = adv.eventType.types;
            } else if (Array.isArray(adv.eventType.gigType) && adv.eventType.gigType.length > 0) {
                flat.gigType = adv.eventType.gigType;
            }
        }

        // timing: { applicationDeadline, deadlineSoon }
        if (adv.timing) {
            if (adv.timing.applicationDeadline) flat.applicationDeadline = adv.timing.applicationDeadline;
            if (adv.timing.deadlineSoon) flat.deadlineSoon = adv.timing.deadlineSoon;
        }

        // sorting: { sortBy }
        if (adv.sorting) {
            if (adv.sorting.sortBy) flat.sortBy = adv.sorting.sortBy;
            if (adv.sorting.sortMode) flat.sortMode = adv.sorting.sortMode;
        }

        // trust: { verified, featured, urgent }
        if (adv.trust) {
            if (adv.trust.featured) flat.featured = adv.trust.featured;
            if (adv.trust.urgent) flat.urgent = adv.trust.urgent;
        }

        // requirements: { perks, category }
        if (adv.requirements) {
            if (Array.isArray(adv.requirements.perks) && adv.requirements.perks.length > 0) {
                flat.perks = adv.requirements.perks;
            }
            if (Array.isArray(adv.requirements.category) && adv.requirements.category.length > 0) {
                flat.category = adv.requirements.category;
            }
        }
    }


    return flat;
}

/**
 * Flattens the nested frontend filter structure for Events.
 */
function flattenEventFilters(nestedFilters: Record<string, any>): Record<string, any> {
    const flat: Record<string, any> = {};

    // Direct fields (backward compatibility)
    const directFields = ['eventType', 'category', 'skillLevel', 'eligibleArtistTypes',
        'locationType', 'city', 'state', 'country', 'onlineOnly',
        'startDateAfter', 'startDateBefore', 'registrationDeadlineBefore',
        'maxPrice', 'freeOnly', 'refundableOnly', 'startDateRange',
        'featured', 'startingSoon', 'popular', 'lowPrice', 'sortBy', 'sortMode'];

    for (const field of directFields) {
        if (nestedFilters[field] !== undefined && nestedFilters[field] !== null) {
            flat[field] = nestedFilters[field];
        }
    }

    // Handle nested "advanced" structure
    if (nestedFilters.advanced && typeof nestedFilters.advanced === 'object') {
        const adv = nestedFilters.advanced;

        // category & eventType
        if (adv.eventType) {
            if (Array.isArray(adv.eventType)) flat.eventType = adv.eventType;
            else if (Array.isArray(adv.eventType.types)) flat.eventType = adv.eventType.types;
        }

        if (adv.category) {
            if (Array.isArray(adv.category)) flat.category = adv.category;
            else if (Array.isArray(adv.category.categories)) flat.category = adv.category.categories;
        }

        // If category is under requirements like in Gigs (fallback):
        if (adv.requirements && adv.requirements.category) {
            flat.category = adv.requirements.category;
        }

        // location: { city, locationType, ... }
        if (adv.location) {
            if (adv.location.city) flat.city = adv.location.city;
            if (adv.location.locationType) flat.locationType = adv.location.locationType;
            if (adv.location.onlineOnly !== undefined) flat.onlineOnly = adv.location.onlineOnly;
        }

        // date / timing
        if (adv.date) {
            if (adv.date.startDateRange) flat.startDateRange = adv.date.startDateRange;
            if (adv.date.startDateAfter) flat.startDateAfter = adv.date.startDateAfter;
            if (adv.date.startDateBefore) flat.startDateBefore = adv.date.startDateBefore;
        }

        // price
        if (adv.price) {
            if (adv.price.maxPrice) flat.maxPrice = adv.price.maxPrice;
            if (adv.price.freeOnly) flat.freeOnly = adv.price.freeOnly;
        }

        // sorting
        if (adv.sorting) {
            if (adv.sorting.sortBy) flat.sortBy = adv.sorting.sortBy;
            if (adv.sorting.sortMode) flat.sortMode = adv.sorting.sortMode;
        }
    }

    return flat;
}

export class SearchController {

    /**
     * GET /search/preview?q=...
     * Unified search preview (LinkedIn style).
     */
    async previewSearch(req: Request, res: Response, next: NextFunction) {
        try {
            const q = (req.query.q as string) || '';

            const results = await searchPreviewService.executePreview(q);

            return res.json(results);
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /search/people?q=...&page=1
     */
    async searchPeople(req: Request, res: Response, next: NextFunction) {
        try {
            const q = (req.query.q as string) || '';
            const page = parseInt(req.query.page as string || '1', 10);
            const filters = req.query; // Expand this later to extract specific filters

            // Extract User ID from header (gateway/auth service usually passes this)
            // or req.user if middleware populated it.
            // Supporting both for flexibility.
            const reqAny = req as any;
            const userId = reqAny.user?._id || reqAny.user?.id || req.headers['x-user-id'] as string;

            const results = await searchService.searchPeople(q, filters, page, userId);
            return res.json(results);
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /search/gigs?q=...&page=1
     */
    async searchGigs(req: Request, res: Response, next: NextFunction) {
        try {
            const q = (req.query.q as string) || '';
            const page = parseInt(req.query.page as string || '1', 10);
            const filters = req.query;

            const results = await searchService.searchGigs(q, filters, page);
            return res.json(results);
        } catch (error) {
            next(error);
        }
    }

    /**
     * POST /search/gigs
     * Filtered search with complex filters in request body.
     * Body: { q, filters, page, pageSize }
     * 
     * Handles nested frontend structure:
     * { filters: { advanced: { compensation: { minCompensation: 5000 } } } }
     */
    async searchGigsFiltered(req: Request, res: Response, next: NextFunction) {
        try {
            const { q = '', filters = {}, page = 1, pageSize = 20 } = req.body;
            console.log(req.body);


            // Flatten nested frontend structure to flat structure expected by normalizer
            const flatFilters = flattenGigFilters(filters);

            console.log('[searchGigsFiltered] Raw filters:', JSON.stringify(filters));
            console.log('[searchGigsFiltered] Flattened filters:', JSON.stringify(flatFilters));

            const results = await searchService.searchGigs(q, flatFilters, page, pageSize);
            return res.json(results);
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /search/events?q=...&page=1
     */
    async searchEvents(req: Request, res: Response, next: NextFunction) {
        try {
            const q = (req.query.q as string) || '';
            const page = parseInt(req.query.page as string || '1', 10);
            const filters = req.query;

            console.log('[SearchController.searchEvents] Params:', { q, page, filters });

            const results = await searchService.searchEvents(q, filters, page);
            return res.json(results);
        } catch (error) {
            next(error);
        }
    }

    /**
     * POST /search/events
     * Filtered search with complex filters in request body.
     */
    async searchEventsFiltered(req: Request, res: Response, next: NextFunction) {
        try {
            const { q = '', filters = {}, page = 1 } = req.body;

            console.log('[searchEventsFiltered] Raw Body Filters:', JSON.stringify(filters));

            const flatFilters = flattenEventFilters(filters);
            console.log('[searchEventsFiltered] Flattened Filters:', JSON.stringify(flatFilters));

            const results = await searchService.searchEvents(q, flatFilters, page);
            return res.json(results);
        } catch (error) {
            next(error);
        }
    }
}

export const searchController = new SearchController();
