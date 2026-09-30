# CC-1 lane cross: scripts/worm-coverage-baseline.json (UNASSIGNED) — P0 blocker

2026-09-30, CC-1.

## Why this crosses

`scripts/worm-coverage-baseline.json` has no assigned lane owner in `LANES.md`. It is the
shrink-only ratchet baseline `verify-worm-coverage-ratchet.mjs` reads, and it was blocking every
seat's push (flagged live by CC-3, T-01 P0, alongside 3 other failures I've already fixed this
same PR).

## What changed

Added `driver_finance.settlement_line_item_splits` (G2's own permanent mapping table, which I
added earlier today) to `protected_tables`, after adding a real database-level WORM delete-trigger
to that table in the same PR (`db/migrations/202614710000_worm_settlement_line_item_splits.sql`).
`unprotected_count` is UNCHANGED at 89 — this is a genuine new protection landing, not a raised
ratchet. Nothing else in the file touched.

LANE_CROSS=docs/bus/2026-09-30-CC1-LANE-CROSS-WORM-COVERAGE-BASELINE.md
