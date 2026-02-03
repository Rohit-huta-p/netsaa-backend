import { EventSearchFilters } from './event-search-filter.dto';

export function normalizeEventFilters(raw: any): EventSearchFilters {
    const hardFilters: EventSearchFilters['hardFilters'] = {};
    const boostSignals: EventSearchFilters['boostSignals'] = {};
    let sortMode: EventSearchFilters['sortMode'] = 'relevance';

    // Helper to ensure array of strings
    const toArray = (val: any): string[] => {
        if (Array.isArray(val)) {
            return val.filter(item => typeof item === 'string' && item.trim().length > 0);
        }
        if (typeof val === 'string' && val.trim().length > 0) {
            return [val.trim()];
        }
        return [];
    };

    // --- Hard Filters ---

    // 1. Enums / Arrays
    const eventType = toArray(raw.eventType || raw.type).map(s => s.toLowerCase());
    if (eventType.length > 0) hardFilters.eventType = eventType;

    const category = toArray(raw.category).map(s => s.toLowerCase());
    if (category.length > 0) hardFilters.category = category;

    const skillLevel = toArray(raw.skillLevel).map(s => s.toLowerCase());
    if (skillLevel.length > 0) hardFilters.skillLevel = skillLevel;

    const eligibleArtistTypes = toArray(raw.eligibleArtistTypes || raw.artistTypes).map(s => s.toLowerCase());
    if (eligibleArtistTypes.length > 0) hardFilters.eligibleArtistTypes = eligibleArtistTypes;

    // 2. Location
    if (raw.onlineOnly === true || raw.onlineOnly === 'true') {
        hardFilters.onlineOnly = true;
        hardFilters.locationType = 'online';
    } else if (raw.locationType && ['physical', 'online', 'hybrid'].includes(raw.locationType)) {
        hardFilters.locationType = raw.locationType;
    }

    if (raw.city && typeof raw.city === 'string') {
        const city = raw.city.trim();
        if (city.toLowerCase() !== 'any' && city.length > 0) {
            hardFilters.city = city;
        }
    }

    // 3. Date Range
    const now = new Date();

    // Custom range
    if (raw.startDateAfter) hardFilters.startDateAfter = new Date(raw.startDateAfter);
    if (raw.startDateBefore) hardFilters.startDateBefore = new Date(raw.startDateBefore);
    if (raw.registrationDeadlineBefore) hardFilters.registrationDeadlineBefore = new Date(raw.registrationDeadlineBefore);

    // Preset ranges (override custom if present)
    if (raw.startDateRange) {
        const range = raw.startDateRange;

        if (range === 'today') {
            hardFilters.startDateAfter = new Date(now);
            const endOfDay = new Date(now);
            endOfDay.setHours(23, 59, 59, 999);
            hardFilters.startDateBefore = endOfDay;

        } else if (range === 'weekend') {
            const day = now.getDay(); // 0 = Sun, 6 = Sat
            const diffToSat = (6 - day + 7) % 7;
            const nextSat = new Date(now);
            nextSat.setDate(now.getDate() + diffToSat);
            nextSat.setHours(0, 0, 0, 0);

            const nextSun = new Date(nextSat);
            nextSun.setDate(nextSat.getDate() + 1);
            nextSun.setHours(23, 59, 59, 999);

            // If today is Sunday, "weekend" usually means NEXT weekend, but diffToSat handles this naturally (6-0+7)%7 = 6 days away.
            // If today is Saturday, diffToSat = 0. So it means THIS weekend (remaining part).

            hardFilters.startDateAfter = nextSat;
            hardFilters.startDateBefore = nextSun;

        } else if (range === '7days') {
            hardFilters.startDateAfter = new Date(now);
            const future = new Date(now);
            future.setDate(now.getDate() + 7);
            hardFilters.startDateBefore = future;

        } else if (range === '30days') {
            hardFilters.startDateAfter = new Date(now);
            const future = new Date(now);
            future.setDate(now.getDate() + 30);
            hardFilters.startDateBefore = future;
        }
    }

    // 4. Price
    if (raw.freeOnly === true || raw.freeOnly === 'true') {
        hardFilters.freeOnly = true;
        hardFilters.maxPrice = 0;
    } else {
        if (raw.maxPrice !== undefined && raw.maxPrice !== null) {
            const price = Number(raw.maxPrice);
            if (!isNaN(price) && price >= 0) {
                hardFilters.maxPrice = price;
            }
        }
        if (raw.refundableOnly === true || raw.refundableOnly === 'true') {
            hardFilters.refundableOnly = true;
        }
    }

    // --- Boost Signals ---
    if (raw.featured === true || raw.featured === 'true') boostSignals.featured = true;
    if (raw.startingSoon === true || raw.startingSoon === 'true') boostSignals.startingSoon = true;
    if (raw.popular === true || raw.popular === 'true') boostSignals.popular = true;
    if (raw.lowPrice === true || raw.lowPrice === 'true') boostSignals.lowPrice = true;


    // --- Sorting ---
    if (raw.sortBy) {
        if (raw.sortBy === 'soonest') {
            sortMode = 'soonest';
            boostSignals.startingSoon = true; // Implicit boost
        } else if (raw.sortBy === 'mostPopular') {
            sortMode = 'mostPopular';
            boostSignals.popular = true;
        } else if (raw.sortBy === 'lowestPrice') {
            sortMode = 'lowestPrice';
            boostSignals.lowPrice = true;
        } else if (raw.sortBy === 'relevance') {
            sortMode = 'relevance';
        }
    }

    return {
        hardFilters,
        boostSignals,
        sortMode
    };
}
