// src/utils/artistSnapshot.ts
//
// B1 — the applicant card (D) wants each applicant's city + a few skills.
// Capture them onto GigApplication.artistSnapshot so the card renders without
// a per-row profile fetch. This pure helper pulls those "extras" off the
// gigs-service User mirror; it's reused at apply-time (write) and by the lazy
// backfill on the applications list (read), so the mapping lives in one place.
//
// Field mapping (service → snapshot / card):
//   User.cached.primaryCity  → primaryCity   (JWT primaryCity is the fallback)
//   User.skills[] (top 3)    → specialities  (the card's "skill chips")
//   User.experienceLevel     → experienceLevel  (the crisp card's briefcase meta)

export interface ArtistSnapshotExtras {
    primaryCity?: string;
    specialities?: string[];
    experienceLevel?: string;
}

export interface ArtistExtrasSource {
    skills?: string[];
    experienceLevel?: string;
    cached?: { primaryCity?: string };
}

/** Max skill chips captured on the card (top-3 + a "+N" on the FE). */
export const MAX_SPECIALITIES = 3;

/**
 * Derive the applicant-card extras from a User doc. `fallbackCity` is the
 * JWT's primaryCity, used only when the mirror has none. Returns a sparse
 * object — absent fields are simply omitted so they never overwrite an
 * existing snapshot value with undefined.
 */
export function artistSnapshotExtras(
    userDoc?: ArtistExtrasSource | null,
    fallbackCity?: string,
): ArtistSnapshotExtras {
    const out: ArtistSnapshotExtras = {};

    const city = userDoc?.cached?.primaryCity || fallbackCity;
    if (city) out.primaryCity = city;

    const skills = userDoc?.skills;
    if (Array.isArray(skills) && skills.length > 0) {
        out.specialities = skills.slice(0, MAX_SPECIALITIES);
    }

    if (userDoc?.experienceLevel) out.experienceLevel = userDoc.experienceLevel;

    return out;
}
