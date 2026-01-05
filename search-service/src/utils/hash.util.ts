import crypto from 'crypto';

/**
 * Creates an MD5 hash of the given string data.
 */
export const createMd5Hash = (data: string): string => {
    return crypto.createHash('md5').update(data).digest('hex');
};

/**
 * Deterministically stringifies an object by sorting its keys.
 * Handles nested objects.
 */
export const stableStringify = (data: any): string => {
    if (typeof data !== 'object' || data === null) {
        return JSON.stringify(data);
    }

    // Handle arrays: stringify each element and join
    if (Array.isArray(data)) {
        return `[${data.map(stableStringify).join(',')}]`;
    }

    // Handle objects: sort keys and stringify values recursively
    const keys = Object.keys(data).sort();
    const entries = keys.map((key) => `"${key}":${stableStringify(data[key])}`);
    return `{${entries.join(',')}}`;
};
