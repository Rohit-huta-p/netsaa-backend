/**
 * Returns the current timestamp in ISO 8601 format.
 */
export const nowIso = (): string => {
    return new Date().toISOString();
};

/**
 * Adds seconds to a given date (or current time if not provided) and returns a new Date object.
 */
export const addSeconds = (seconds: number, date: Date = new Date()): Date => {
    return new Date(date.getTime() + seconds * 1000);
};

/**
 * Checks if a date string is in the future compared to now.
 */
export const isFuture = (dateString: string): boolean => {
    return new Date(dateString) > new Date();
};
