# Atlas Search Indexes

Apply via Atlas UI → Search → Create/Edit Index → JSON Editor.

Index JSON files are named `<index_name>.v<N>.json`. Bump the version suffix on every change.

## Current versions

- `people_search_index.v2.json` — adds `skills`, `languages`, `bio`, `lastActiveAt`, `cached.connectionStats.degree1Count` (and preserves all existing fields)

## Apply order

For artist-search-v2 release, apply `people_search_index.v2` before flipping the `SEARCH_PEOPLE_V2` env flag.

## Rollback

To roll back: re-create the index using the previous version's JSON (kept in git history). Rebuild takes 1–5 min.

## Notes

- These files are the SOURCE OF TRUTH for the Atlas Search index definitions. The Atlas UI is just the deploy target.
- Validate JSON locally before pasting: `python3 -m json.tool atlas-indexes/people_search_index.v2.json > /dev/null`
