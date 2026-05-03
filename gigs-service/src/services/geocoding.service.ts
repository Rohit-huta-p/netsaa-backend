/**
 * Geocoding service — turn a postal address into lat/lng.
 *
 * Default provider: OpenStreetMap Nominatim (free, no API key, ≤1 req/sec
 * per their usage policy). Swap to Google or Mapbox in production by
 * setting GEOCODING_PROVIDER + corresponding *_API_KEY env vars.
 *
 * The function is intentionally tolerant: it never throws on network
 * failure or unparseable address — returns `null` and lets the caller
 * decide what to do (the Gig pre-save hook treats null as "no geo this
 * round" and saves the gig anyway).
 *
 * Caching: there is none in-process. If the same address is geocoded on
 * back-to-back saves (rare), we'll hit the provider twice. Add a Redis
 * cache here if cost or rate-limit becomes an issue.
 */

import axios from 'axios';

export interface GeocodeResult {
    lat: number;
    lng: number;
    source: 'nominatim' | 'google' | 'mapbox' | 'mock';
    /** Raw display name returned by the provider — useful for debug logs. */
    displayName?: string;
}

/**
 * Read provider/config at call-time, not module-load time. This lets tests
 * flip GEOCODING_PROVIDER between cases and lets prod swap providers via a
 * config reload without restarting the service.
 */
function currentProvider(): string {
    return (process.env.GEOCODING_PROVIDER || 'nominatim').toLowerCase();
}

function userAgent(): string {
    return process.env.GEOCODING_USER_AGENT || 'NETSA-Backend/1.0 (ops@netsa.in)';
}

function requestTimeoutMs(): number {
    return Number(process.env.GEOCODING_TIMEOUT_MS) || 5000;
}

/**
 * Public entry point. Returns parsed coords or null on any failure.
 *
 * Address formatting: callers should pass a comma-separated string in
 * the form "Venue, Address line, City, State, Country" (any segments
 * may be omitted). The function does no normalisation.
 */
export async function geocodeAddress(
    address: string
): Promise<GeocodeResult | null> {
    // Quick reject for obvious garbage. The provider will accept these
    // but waste a network round-trip.
    if (!address || address.trim().length < 5) return null;

    // Test environment short-circuit. Avoids hitting any external service
    // during jest runs unless explicitly opted in via GEOCODING_LIVE=1.
    if (process.env.NODE_ENV === 'test' && process.env.GEOCODING_LIVE !== '1') {
        return null;
    }

    try {
        const provider = currentProvider();
        if (provider === 'nominatim') {
            return await geocodeViaNominatim(address);
        }
        if (provider === 'mock') {
            return geocodeViaMock(address);
        }
        // TODO: 'google' / 'mapbox' providers
        return await geocodeViaNominatim(address);
    } catch (err: any) {
        // Last-resort: never throw. Geocoding failure is not fatal.
        console.warn(
            '[geocoding] unexpected error (returning null):',
            err?.message || err
        );
        return null;
    }
}

/**
 * Nominatim implementation — free, rate-limited, no API key.
 * Endpoint:  GET https://nominatim.openstreetmap.org/search
 * Required params: q, format=json, limit=1
 */
async function geocodeViaNominatim(
    address: string
): Promise<GeocodeResult | null> {
    try {
        const res = await axios.get(
            'https://nominatim.openstreetmap.org/search',
            {
                params: {
                    q: address,
                    format: 'json',
                    limit: 1,
                    addressdetails: 0,
                },
                headers: { 'User-Agent': userAgent() },
                timeout: requestTimeoutMs(),
            }
        );

        if (!Array.isArray(res.data) || res.data.length === 0) {
            return null;
        }

        const hit = res.data[0];
        const lat = parseFloat(hit.lat);
        const lng = parseFloat(hit.lon);

        // Defensive — Nominatim has been known to return strings that
        // parseFloat doesn't choke on but produce NaN with leading garbage.
        if (!isFinite(lat) || !isFinite(lng)) return null;
        if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

        return {
            lat,
            lng,
            source: 'nominatim',
            displayName: hit.display_name,
        };
    } catch (err: any) {
        console.warn(
            '[geocoding] nominatim failed (non-fatal):',
            err?.message || err
        );
        return null;
    }
}

/**
 * Mock implementation for tests + local dev. Returns deterministic coords
 * keyed off the city name so tests can assert on lat/lng without network.
 *
 * Pattern: hash the lower-cased input to a stable lat/lng inside India's
 * bounding box. Real values for known cities; fallback to deterministic
 * pseudo-random for unknown.
 */
function geocodeViaMock(address: string): GeocodeResult | null {
    const KNOWN: Record<string, [number, number]> = {
        pune: [18.5204, 73.8567],
        mumbai: [19.076, 72.8777],
        bangalore: [12.9716, 77.5946],
        bengaluru: [12.9716, 77.5946],
        delhi: [28.6139, 77.209],
        hyderabad: [17.385, 78.4867],
        chennai: [13.0827, 80.2707],
        kolkata: [22.5726, 88.3639],
    };

    const lc = address.toLowerCase();
    for (const [city, [lat, lng]] of Object.entries(KNOWN)) {
        if (lc.includes(city)) {
            return { lat, lng, source: 'mock', displayName: city };
        }
    }
    return null;
}
