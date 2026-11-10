/**
 * Canonical aliases for Indian cities that carry an older / anglicised spelling.
 *
 * The discovery boards send lowercase slugs (e.g. 'bangalore') while stored
 * `location.city` is the modern spelling (e.g. 'Bengaluru'), so an anchored
 * regex on the slug alone never matches. Expanding each incoming token to its
 * full alias set — matched case-insensitively downstream — makes the city
 * filter robust to whichever spelling a given record happens to use.
 *
 * Each group lists every spelling that should be treated as the same city.
 */
const CITY_ALIAS_GROUPS: readonly string[][] = [
    ['bangalore', 'bengaluru'],
    ['bombay', 'mumbai'],
    ['calcutta', 'kolkata'],
    ['madras', 'chennai'],
    ['gurgaon', 'gurugram'],
];

/**
 * Expand a city token to every spelling it should match (lowercased).
 *
 * Returns the token's alias group when it belongs to one, otherwise the token
 * itself — so unknown cities keep their current exact-match behaviour. The
 * result is lowercased; callers anchor it in a case-insensitive RegExp, so it
 * still matches Title-Case stored values.
 */
export function expandCityAliases(city: string): string[] {
    const norm = city.trim().toLowerCase();
    if (!norm) return [];
    const group = CITY_ALIAS_GROUPS.find((g) => g.includes(norm));
    return group ? [...group] : [norm];
}
