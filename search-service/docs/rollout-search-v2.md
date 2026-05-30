# Artist Search v2 — Rollout Plan

**Feature flag:** `SEARCH_PEOPLE_V2` (env, both backend + mobile)
**Spec:** `docs/superpowers/specs/2026-05-29-artist-search-design.md`
**Plan:** `docs/superpowers/plans/2026-05-29-artist-search.md`

## Gradual ramp (4 weeks)

| Week | Cohort | % | Goal |
|------|--------|---|------|
| 1 | Internal users only | 5% | Validate SLOs + ranking sanity |
| 2 | Pune launch wedge | 25% | Monitor zero-result + cold-start; compare v1 vs v2 connect-CTR |
| 3 | Tier-1 cities (Mumbai, Delhi, Bangalore) | 75% | Validate worker capacity at scale |
| 4 | All users | 100% | v1 code retained as fallback for 14 days |

## Apply order

1. Apply `atlas-indexes/people_search_index.v2.json` in Atlas UI (wait until "Active")
2. Deploy backend with `SEARCH_PEOPLE_V2=false` (default — no behavior change)
3. Start `pymk.recompute` scheduler externally (cron) — see `src/workers/pymk.scheduler.ts`
4. Wait one full cycle (~6h) so `pymk_recommendations` collection has data
5. Flip `SEARCH_PEOPLE_V2=true` for the cohort

## Mobile flag

Mobile reads `EXPO_PUBLIC_SEARCH_PEOPLE_V2` via `src/utils/flags.ts`. As of this rollout, the flag is exposed but does not yet gate the SearchBar or other new components — they render unconditionally. A follow-up will gate SearchBar mount in `Navbar.tsx` behind this flag.

## Rollback criteria (any one triggers immediate rollback)

- `search.preview.latency_p95` > 400ms for 15 min
- `cache.hit_rate` < 50% for 30 min
- `pymk.cold_start_rate` > 20% for 1 hour
- `search.zero_result_rate` > 8% for 30 min
- Error rate (5xx) > 1% for 5 min on any endpoint

## Rollback procedure

1. Set `SEARCH_PEOPLE_V2=false` on the affected cohort.
2. v1 ranking path takes over immediately (no deploy required).
3. New endpoints (`/discover/pymk`, `/discover/similar/*`, `POST /pymk/dismiss`) remain available — they're additive and not gated.
4. Investigate via `search_logs` (when shipped) + standard log aggregation.

## Decommission

After 14 days at 100% with no rollback, delete:

- `src/modules/people/people.search.ts` V1 fallback branch
- `src/infra/search/pipelines/people.pipeline.ts` `buildPeoplePipeline` (V1 export)
- `src/ranking/people.rank.ts` (V1 weights)
- The flag itself

This decommission is its own commit/PR; do not bundle with the rollout.
