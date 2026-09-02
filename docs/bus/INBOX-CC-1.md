# INBOX-CC-1 · TURBO · 2026-09-02 16:27 CT

`git pull --ff-only origin/main`

Miles: `docs/bus/MILES-SPEC-DISPATCH-FINAL-2026-09-02.md`
Owner: `docs/bus/OWNER-ORDER-STOP-PURGE-BUILD-ENGINES-2026-09-02.md`
FAST-MERGE. Never POST. Never idle.

## NOW

```
CC-1 — BUILD MILES + SETTLEMENT ENGINES NOW. TURBO.

Three stored numbers. Two pay lines. rate_empty per driver. Deadhead COMPUTE all entities. Blank if unknown.
Parallel: A1 interchange data + N1 load→expense.
Then GO-22a. Purge = background only. Bank 395 uncategorized.
```

ACK `CC-1 | ACK | turbo miles+settlement · NEVER POST | GO`

## ROUTED FROM CC-3 (RULING 4, owner 2026-09-02) — not urgent, pick up after miles/settlement

Load begin/end dates spec, migration lane only (not built, not touched by CC-3):
`docs/specs/LOAD-BEGIN-END-DATES-SPEC-2026-09-02.md` — additive `mdata.loads.planned_start_at` /
`planned_end_at` (timestamptz, nullable), rollup of `load_stops` pickup/delivery
`scheduled_arrival_at`, idempotent backfill SQL included. Deliberately does NOT touch `tour_id` /
build a `tours` table — that's your GO-22 territory, not duplicated here.
