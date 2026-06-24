// netsa-backend/gigs-service/src/utils/geocode.ts
//
// Best-effort venue → {lat,lng} via OpenStreetMap Nominatim (keyless, free).
// Used by createGig / updateGig to populate `location.geo` so the artist gig
// detail can show distance-from-you. NEVER throws and NEVER blocks a gig post:
// on any failure (no match, timeout, offline, rate-limit, old runtime) it
// resolves null and the gig saves without coordinates.
//
// Nominatim rarely matches a full "venue, street, city, state, country" string
// (verified: that 404s to []), so we try a FALLBACK CASCADE from most to least
// specific and take the first hit — city-level always resolves, giving an
// approximate centre when the exact venue isn't found.
//
// Nominatim policy: <= 1 req/s, descriptive User-Agent required. Gig posts are
// low-frequency (a few requests per post) so we stay well under the limit. To
// switch to Google Geocoding later, set GOOGLE_MAPS_API_KEY and branch here.

interface Geo {
    lat: number;
    lng: number;
}

interface LocationInput {
    venueName?: string;
    address?: string;
    city?: string;
    state?: string;
    country?: string;
}

const TIMEOUT_MS = 3500;

async function queryNominatim(g: any, query: string): Promise<Geo | null> {
    const controller = typeof g.AbortController === 'function' ? new g.AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), TIMEOUT_MS) : null;
    try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`;
        const res = await g.fetch(url, {
            headers: { 'User-Agent': 'NETSA/1.0 (gigs-service; venue geocoding)' },
            signal: controller?.signal,
        });
        if (!res.ok) return null;
        const data: any = await res.json();
        if (!Array.isArray(data) || data.length === 0) return null;
        const lat = parseFloat(data[0].lat);
        const lng = parseFloat(data[0].lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        return { lat, lng };
    } catch {
        return null; // timeout / network / parse — best-effort only
    } finally {
        if (timer) clearTimeout(timer);
    }
}

export async function geocodeLocation(loc: LocationInput | undefined | null): Promise<Geo | null> {
    if (!loc) return null;

    // `fetch` / `AbortController` are globals on Node >= 18. Reach them via
    // globalThis (cast to any) so this compiles regardless of tsconfig `lib`
    // and degrades to null on older runtimes.
    const g: any = globalThis as any;
    if (typeof g.fetch !== 'function') return null;

    const join = (parts: (string | undefined)[]) =>
        parts.map((p) => (p ?? '').trim()).filter(Boolean).join(', ');

    // Most-specific → least-specific. First hit wins; city-level almost always
    // resolves. De-duplicated so empty fields don't repeat a query.
    const candidates = [
        join([loc.venueName, loc.city, loc.state, loc.country]),
        join([loc.address, loc.city, loc.state, loc.country]),
        join([loc.city, loc.state, loc.country]),
    ].filter(Boolean);

    const seen = new Set<string>();
    for (const q of candidates) {
        if (seen.has(q)) continue;
        seen.add(q);
        const hit = await queryNominatim(g, q);
        if (hit) return hit;
    }
    return null;
}

export default { geocodeLocation };
