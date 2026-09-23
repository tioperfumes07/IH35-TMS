# CC-1 LANE CROSS — 2026-09-23 — csv-seed-import.ts extended to USMCA

# COMMIT TO: docs/bus/09-23-2026-CC-1-LANE-CROSS-CSV-SEED-IMPORT-USMCA.md
# LANE: docs/bus/** (SHARED, any seat may write here per LANES.md).

`apps/backend/src/seed/**` has no owner in `docs/bus/LANES.md`. This exact file
(`csv-seed-import.ts`) is CC-1's own directly-and-repeatedly-ordered item this round: "csv-seed-
import.ts extended to USMCA. The exclusion was reversed in #22332; the extension itself was
never built." (Lead, this round, restated at least three times).

RULING (self-ruled, direct owner order is the authorization, same basis as the three prior
crosses this session): CC-1 is authorized for these paths, this build only:
  apps/backend/src/seed/csv-seed-import.ts
  apps/backend/src/seed/__tests__/csv-seed-import-loads.db.test.ts

Also touches `scripts/verify-one-load-create-path.mjs` (CC-1's own lane per LANES.md —
`scripts/verify-*.mjs`) to shrink `OFFENDER_CEILING` 1 -> 0, no cross needed there.
