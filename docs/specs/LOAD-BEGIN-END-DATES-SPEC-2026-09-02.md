# Load begin/end dates — schema spec (RULING 4, owner 2026-09-02)

**Author:** CC-3 (mechanical/FE — migration is CC-1's lane, `db/migrations/*.sql` is fail-closed
banned for CC-3 by `verify-migration-lane-band.mjs`). This is a spec handoff, not a migration.
**Owner ask:** "loads carry no start and end date. Without them a load cannot be planned, paired,
or tied to a tour."

## Current state (verified live, Neon prod `tiny-field-89581227`, bypass_rls)

- `mdata.loads` has **no** start/end date column at all today — only `created_at` (row-creation
  timestamp, not trip-planning data) and a **dangling `tour_id uuid NULL`** column: it already
  exists on the table, but **no `tours` table exists anywhere in the schema** (`information_schema`
  query for `%tour%` returns zero tables). `tour_id` is a forward-declared FK with nothing to point
  at yet.
- `mdata.load_stops` already carries real per-stop timing: `scheduled_arrival_at` /
  `scheduled_departure_at` (both `timestamptz`), keyed by `load_id` + `sequence_number` +
  `stop_type` (`pickup`/`delivery`). A load's first pickup stop and last delivery stop already have
  real, operator-entered dates — there is no per-stop gap, only a load-level rollup gap.
- Live row count: **6 loads system-wide** (all entities) — trivial backfill regardless of approach.

## Two separate things are tangled in the ask — split them

1. **Load-level planning dates** (a load's own start/end, for calendar + trip-pairing): this is a
   **rollup of stops the load already has**, not new operator data entry. This is what "planned" and
   "paired" need (`TripPairingBoardPage.tsx`, `PlannerCalendarPage.tsx` both need a load-level date
   range to place a load on a timeline without joining to `load_stops` on every render).
2. **Tour** ("tied to a tour"): `tour_id` already exists and is dangling. A.3 (the settlement-model
   law, `docs/bus/...`) defines TOUR as "truck leaves home base → … → truck returns home base,"
   which is **CC-1's GO-22 settlement-engine territory**, already active (home base = 23918 Mines
   Rd, Laredo TX 78045; tour closes on the yard-return leg, not the southbound leg). Building a
   parallel/competing `tours` table here would collide with CC-1's in-flight work.

**Recommendation: this spec covers #1 only.** #2 (creating `dispatch.tours` / whatever satisfies
`mdata.loads.tour_id`'s FK) should stay inside CC-1's GO-22 slice — they already own the concept and
are actively building the engine that consumes it; a second builder inventing the tours table
independently is exactly the collision Rule 27 (one open PR per area) exists to prevent.

## Proposed schema (additive, CREATE/ALTER-only, idempotent)

```sql
ALTER TABLE mdata.loads
  ADD COLUMN IF NOT EXISTS planned_start_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS planned_end_at   timestamptz NULL;

COMMENT ON COLUMN mdata.loads.planned_start_at IS
  'Rollup of the load''s earliest pickup stop scheduled_arrival_at. Written at booking time and
   re-synced whenever stops change (application code, not a trigger — see backfill rule). Nullable:
   a load with no stops yet (should not happen post-booking, but the column must not require it).';
COMMENT ON COLUMN mdata.loads.planned_end_at IS
  'Rollup of the load''s latest delivery stop scheduled_arrival_at. Same write rule as
   planned_start_at.';
```

- **Types:** `timestamptz`, matching `load_stops.scheduled_arrival_at` exactly (no precision loss,
  no timezone-string parsing needed on either side of the rollup).
- **Nullability:** both NULL-able. A load can exist with incomplete stop scheduling (e.g., mid-edit,
  or a historical-import row per the `PRE_TMS_DISPATCH_IMPORT` exemption class) — NULL is the honest
  state, never a placeholder date.
- **No new table, no new FK.** This is two denormalized columns on an existing table, not a new
  entity — matches the existing pattern of `mdata.loads` already carrying `rate_total_cents` and
  other booking-time rollups.

## Backfill rule (idempotent, safe to re-run)

```sql
UPDATE mdata.loads l
SET planned_start_at = sub.min_pickup,
    planned_end_at   = sub.max_delivery
FROM (
  SELECT
    load_id,
    MIN(scheduled_arrival_at) FILTER (WHERE stop_type = 'pickup')   AS min_pickup,
    MAX(scheduled_arrival_at) FILTER (WHERE stop_type = 'delivery') AS max_delivery
  FROM mdata.load_stops
  GROUP BY load_id
) sub
WHERE l.id = sub.load_id
  AND (l.planned_start_at IS DISTINCT FROM sub.min_pickup
       OR l.planned_end_at IS DISTINCT FROM sub.max_delivery);
```

Then going forward: Book Load's create/update-stops write path (backend) writes the same rollup in
the same transaction as the stops write, so the columns never silently drift from their source of
truth (`load_stops`) — same discipline as `verify-derived-artifact-freshness.mjs` exists to enforce
elsewhere: a stored rollup must be kept true at write time, not just backfilled once.

## Linkage declaration (§10 LINKAGE LAW)

- Canonical target: `mdata.loads` (hub table, not a RETIRE table).
- Read path: `TripPairingBoardPage.tsx`, `PlannerCalendarPage.tsx`, `RoundTrips.tsx` (all already
  query loads for scheduling — they gain a load-level date range instead of joining `load_stops`).
- Write path: the same load/stops-write route(s) that already write `load_stops.scheduled_arrival_at`
  (`apps/backend/src/dispatch/loads.routes.ts`) — one additional rollup write in the same
  transaction, not a new writer.
- Both-way: `mdata.loads.planned_start_at/end_at` ⇄ `mdata.load_stops.scheduled_arrival_at` — the
  load columns are a cache of the stops data, stops remain the source of truth. Never write the load
  columns independently of a stops write.

## What CC-3 will NOT do

- Not authoring the migration file (`db/migrations/*.sql`) — CC-1's lane.
- Not touching `tour_id` / building a `tours` table — CC-1's GO-22 territory, already active.
- Not wiring the frontend calendar/pairing consumers yet — that follows once the columns exist and
  are populated; guessing at that UI shape before the data exists would be inventing scope.

**Handoff:** routed to CC-1 (migration lane, 00:00–11:59 UTC window) via `docs/bus/INBOX-CC-1.md`.
