# OUTBOX — CC-3 — restarted 2026-09-30T11:27Z
# One entry per job id: JOB ID · what I changed · pasted live proof · what is left.
# Append below. Do not delete another seat's entries.

ACK 2026-09-30 · CC-3 · read NOW-CC-3 · starting T-02

T-03 · catalog_ready / On-time click investigation — cannot reproduce live, measured
2026-09-30:
- Backend (dispatch/truck-line/truck-line.routes.ts): reasonsTableExists uses
  `to_regclass('catalogs.load_exception_reasons') IS NOT NULL`, added 2026-09-11
  (fee7a7fdf). to_regclass is catalog metadata, not RLS-gated. Verified live under the
  EXACT scoping withCompanyScope uses (SET LOCAL ROLE ih35_app, no bypass_rls) --
  returns non-null (true) as both neondb_owner and ih35_app.
- The frontend's `catalogReady` (TruckLineBoard.tsx:898) has exactly one consumer
  (:1288) -- an informational banner ("Reason catalog not yet available"). It does not
  disable or gate the On-time node's onClick, which always opens the exception popover
  regardless.
- The actual reasons list the popover shows comes from a SEPARATE endpoint,
  /api/v1/catalogs/load-exception-reasons (load-exception-reasons.routes.ts), which
  hardcodes `catalog_ready: true` (a fixed literal, not a live probe) and queries
  `WHERE operating_company_id = $1 AND is_active = true`.
- Measured live, full scoping (ih35_app role, current_user_id = a real Owner user,
  operating_company_id = USMCA 5c854333-6ea5-4faa-af31-67cb272fef80): count = 11 active
  reasons, matching the 11 the job packet named. No 403 from resolveOperatingCompanyId
  (Owner's org.user_accessible_company_ids() covers every company).
- Backend deployed SHA 7291c8e (built 2026-09-30T14:42:12Z) and frontend deployed build
  15b2636 (built 2026-09-30T15:36:22Z) are both current -- not a stale-deploy issue.
- CONCLUSION: could not reproduce catalog_ready=false or an empty reasons list for the
  Owner role in USMCA with today's deployed code. Either already fixed by an earlier
  commit today (the report predates one of today's many merges) or was transient. If it
  recurs, the next data point that would actually narrow it: the exact role of the user
  who saw it (GRANTLESS-403's known gap is Administrator/Dispatcher/Manager/Safety
  accounts with zero org.user_company_access rows querying a NON-default company --
  Owner is immune to that path) and a browser network-tab capture of the real response
  body, not just the on-screen symptom.

T-04 · Truck Line bottom-section feed — DONE, merged (PR #23437, 1154f4ff9b):
- ROOT CAUSE: the feed's only query INNER JOINs mdata.units on assigned_unit_id plus
  AND assigned_unit_id IS NOT NULL, so a booked/planned/assigned load with no unit yet
  structurally has nowhere to appear. DISPATCH_WORK_LOAD_STATUSES already includes
  booked/planned/assigned/unassigned/assigned_not_dispatched -- status was never the
  exclusion, the unit JOIN was.
- FIX: new `pending_rows` in the response -- PENDING_LOAD_STATUSES (the dispatch-work set
  minus the four actively-rolling statuses, derived not duplicated) LEFT JOIN units,
  excluding anything that already qualifies for the top-level `rows` (NOT EXISTS mirroring
  UNIT_IN_SERVICE_SQL) so the two lists can never disagree or duplicate a row. Promotion
  needs no separate write path -- crossing into an active status simply stops matching
  pending and starts matching top on the next 30s poll.
- PROOF: 4/4 new unit tests, backend+frontend tsc clean. Live non-duplication case
  confirmed on real data (company 91e0bf0a-133f-4ce8-a734-2586cfa66d96's one live
  assigned_not_dispatched load, unit T139 in-service, correctly excluded from pending,
  stays in top only). USMCA itself has 0 loads in any pre-dispatch status right now, so a
  positive "row appears in pending" example needs a real booked load to exist first --
  not available today without writing new load data (owner freeze).
- REMAINING: bottom-section UI render is a separate build, per the job assignment.

T-21 · geofence mileage engine — measured live 2026-09-30, structural finding confirmed
(reporting before building further, per NOW-CC-3 instruction):
- `materializeRealDrivenMilesSegments` is STILL producing nothing: `telematics.load_
  odometer_segments` is 40 rows, newest created_at 2026-09-29 21:40:25Z (yesterday) --
  with odometer NOW flowing live (300 rows with odometer_mi in the last 2h, newest ping
  2026-09-30 16:20:15Z, confirming T-20's fix is holding). This is the real defect the
  Lead asked me to measure, not assume: odometer is no longer the blocker.
- ROOT CAUSE: 0 of 83 USMCA dispatch-work `mdata.load_stops` rows have `location_id`
  populated (dispatcher-entered pickup/delivery addresses are always free-text, never
  selected from the `mdata.locations` catalog). The materializer's pickup/delivery join
  goes through `load_stops.location_id -> mdata.locations`, so it can structurally never
  match regardless of odometer quality -- only a yard-exit leg (the separate
  `is_ih35_yard` flag path) could theoretically produce a segment today.
- The spine IS alive and current: `geo.geofence_events` 689 rows (newest 16:15:18Z),
  `geo.geofence_state_transitions` 7,615 rows (newest 16:17:09Z) -- this is the real
  foundation T-21's new odometer-capture engine should build on, not the stuck
  load_odometer_segments materializer.
- Per the Lead's own retraction: this is Engine B (verification-only); settlements
  already compute miles from Engine A (`mdata.loads`, MPG=7.287 today). Nothing is
  blocked on this -- proceeding to build the geofence-enter/exit odometer capture
  (SOURCE always labelled, idempotent, guard + freshness alarm) as time allows.

T-21 · geofence odometer capture engine — BUILT, live proof, PR #23453 (not yet
mergeable, see below):
- telematics.geofence_odometer_captures (migration 202614740000): one row per
  geo.geofence_events crossing, UNIQUE geofence_event_id (idempotent). SOURCE NEVER
  GUESSED: real_obd (reading within 120s), interpolated (bracketed by two real
  readings), or absent (honest null) -- matches mpg_method's established pattern.
  captureGeofenceOdometerEvents() + a 10-minute cron (same shape as the existing
  real-driven-miles-segments cron) + verify-geofence-odometer-capture-freshness.mjs
  (6h staleness alarm + source-label honesty check), wired into prod-postdeploy-
  verify.yml per the Lead's own newer live-DB-guard ruling.
- LIVE PROOF: ran against production USMCA after applying the migration -- 690
  geofence events, 690 captures written, 0 skipped: real_obd=3, interpolated=615,
  absent=72 (odometer only resumed flowing hours ago via T-20; the 3 real_obd are the
  handful of very recent events close enough to a direct reading -- honest, not
  fabricated).
- Along the way, found and fixed a severe pre-existing migration-ledger crisis
  (unrelated to T-21 itself, blocking every migration-touching push): 8 migration-
  number collisions (4 already flagged by CC-1, 4 more found here) + 1 checksum drift,
  all baselined via the guard's own pre-existing documented-exception mechanisms, no
  DDL touched. One genuine orphan (202614620000, unrecoverable) stays filed as
  MIGR-COLLISION-01 in GUARD-WORKORDERS.md.
- NOT YET MERGED: verify-cash-flow-reads-delivery-date currently fails for all 16
  USMCA dispatched loads ("no non-void invoice found at all") -- confirmed this is
  CC-2's own active invoice-purge work in flight, unrelated to this PR's diff and
  pre-existing on origin/main. Holding PR #23453 open rather than admin-merging past
  a real (if unrelated) red check on invoice data.

ACK 2026-09-30 · CC-3 · read NOW-CC-3 ROUND 296 · T-21 (#23453) merge confirmed correct
per Lead's explanation (AUTH-177 purge, not CC-2, caused the cash-flow red) · T-01/T-01b
confirmed merged and LIVE (backend deployed 17:04 CT) · dispatch.stop_arrivals=0 rows is
CORRECT right now (closest truck 93mi from its next stop, 250ft arrival radius) · starting
T-02, building against the real engine.

T-02 · Truck Line node advancing off the real engine — VERIFIED, no code change needed:
- Confirmed live (backend deploy 218bdbc4a8, deriveTruckLineStation/station.ts +
  deriveLiveStation/TruckLineBoard.tsx): both are pure functions reading directly from
  mdata.load_stops.actual_arrival_at/actual_departure_at + dispatch.pod_documents +
  accounting.invoices -- no fixture, no mock, no separate "station" column anywhere in
  either path. The rail node and the live truck graphic were already correctly wired
  before today; nothing needed building.
- LIVE PER-LOAD STAMP COUNTS (all 16 USMCA dispatched loads, measured just now):
  15 of 16 show 0 arrivals / 0 departures / 0 dispatch.stop_arrivals rows -- honestly
  matching the Lead's own measurement (closest truck 93mi from its next stop, 250ft
  arrival radius). Load 13637/T176 carries 1 arrival + 1 departure (the AUTH-152 real
  backfill from earlier this session). dispatch.stop_arrivals = 0 rows total, all
  companies -- matches exactly.
- BOARD SCREENSHOT: live Truck Line view, every row's rail correctly stuck at
  "Dispatched" (green node lit at position 0 only), truck graphics showing real
  Live/Stale GPS position + city/road separately from the stamped rail -- e.g. T170
  and T173 correctly flagged "Stale ... 20h ago" / "5h ago" rather than silently
  parked. Screenshot on file
  (screenshot-1790790166640-0.jpg).
- CONCLUSION: the board is honest end-to-end right now. It will advance its own rail
  the instant dispatch.stop_arrivals/load_stops gets a real row from the now-live
  arrival-detection engine -- no further CC-3 work required for T-02 itself.

T-13 · geofence engine re-verify after T-01 — measured live, honest idle confirmed:
- geo.geofence_events: 691 rows, newest 2026-09-30T18:24:59Z (growing, engine actively
  evaluating). telematics.vehicle_locations: 341 fresh positions in the last hour alone.
  dispatch.stop_arrivals: still 0 rows. Newest eld_geofence-sourced load_stops arrival:
  still 2026-09-28T17:35:04Z (pre-restart) -- UNCHANGED, and that is CORRECT, not a
  regression: matches T-02's own finding that no truck is within the 250ft arrival
  radius yet. The engine is live, evaluating fresh positions continuously, and has
  produced zero false positives. Nothing further needed for T-13 until a truck actually
  arrives.

T-06 · Driver roster reconciliation — three-way comparison + a bigger root cause found,
MEASURED ONLY, nothing changed:
- THREE DEFINITIONS OF "ACTIVE" COEXIST, measured live, USMCA:
    mdata.drivers.status = 'Active'                                    19 drivers
    integrations.active_driver_set_cache (GAP-25 canonical definition,
      current vehicle_driver_assignment + live position, 15d threshold)  16 drivers <- THIS is the "~16" the owner sees
    ANY Samsara signal (login or HOS snapshot, 30d)                      89 drivers
  The 16-number is not a bug in isolation -- it is the documented, deliberate GAP-25
  definition (assignment + live position), and it already excludes sample/deactivated/
  terminated drivers correctly.
- THE REAL DELTA (19 admin-Active minus the 16 canonical-active = 3 drivers):
    Pedro Abraham Lopez Collado  -- ZERO vehicle_driver_assignments rows, ever. ZERO
      samsara_driver_id. A pure admin record with no telematics link at all.
    Eduardo Azael Flores Ortiz   -- has a DUPLICATE Inactive row; the Active row has no
      samsara_driver_id and zero assignment rows.
    Jorge Flores Valadez         -- HAS samsara_driver_id (59829032) but
      last_samsara_login_at is NULL and zero vehicle_driver_assignments rows -- Samsara
      knows this driver exists but the app's own assignment pipeline never linked him to
      a truck.
  None of these three is "wrong" to exclude from the canonical active count -- they
  genuinely have no live-position evidence. The gap is in the ASSIGNMENT PIPELINE
  (telematics.vehicle_driver_assignments), not the active-set query.
- THE BIGGER FINDING, not asked for but found while building the delta table: **67
  duplicate-name driver groups in USMCA alone**, several 3-4x: "Genaro Guerrero Chavez"
  (3 rows: Active/Inactive/Active), "Angel Alfonso Sosa" (3: Inactive/Active/Inactive),
  "Hugo Gaytan" (3: Inactive/Inactive/Active), "Juan Pablo Hernandez Estrada" (4x
  Inactive), "Carlos Galaviz" (4x Inactive), plus ~60 more 2x pairs including "Driver
  Dummy" (2x Inactive -- a fixture name with real duplicate rows). This is almost
  certainly the REAL root cause behind "only ~16 show active": a real driver's identity
  is split across multiple mdata.drivers rows (no stable de-dup key on import), so
  status/samsara_driver_id/assignment history can each land on a DIFFERENT row for the
  SAME person, making any single-table "active" count structurally unreliable regardless
  of which definition is used.
- NOT CHANGED, per the job's own instruction ("before changing anything"): no rows
  merged, no status flipped, no assignment backfilled. merged_into_driver_id already
  exists as a schema column for exactly this class of fix (driver merge) -- that is the
  tool, but using it on 67 groups is a real, reviewed decision, not something to do
  blind inside a measurement task.
2026-09-30 ~19:35 CT)

Building Round 297.1's required schema change (telematics.odometer_readings DROP NOT NULL +
date-grain unique index, number 202614950000 after two prior claims got overtaken live -- see
below), `ALLOW_PROD_MIGRATE=1 node scripts/db-migrate.mjs` refuses with LV-087 (5 unexplained
mirror-only rows), regardless of which clean number I pick. This is not historical -- it is
happening live, right now, while I watch it:

- First checked ~19:10 CT: 202614790000/800000/810000 were mirror-only under names
  `pm_catalog_usmca` / `pm_schedules_usmca_16units` / `work_orders_backfill_source_type`,
  `applied_by='CC-1'`. Claimed 202614820000 instead (verified clean on both ledgers at claim
  time, PR #23488 merged).
- Re-checked ~19:30 CT: the SAME three filenames had moved to 202614800000/820000/830000
  (`applied_at` 19:15:58 and 19:30:10, `applied_by='CC-1'`) -- CC-1 is actively applying
  migrations directly to the mirror ledger right now, not through CLAIMED-MIGRATION-NUMBERS.json,
  so every number I claim through that registry is invisible to CC-1's own apply path and can
  (and did) collide live.
- Picked 202614950000 (well ahead of CC-1's current pace), verified clean on both ledgers
  immediately before running db-migrate.mjs -- but LV-087 doesn't care about MY number
  specifically; it refuses on ANY unexplained mirror-only row anywhere in the ledger, and right
  now there are 5: 202614770000_bills_mdata_vendor_id_fk.sql, 202614780000_invoice_must_have_
  lines_constraint.sql, plus the three CC-1 pm/work-order ones above. This blocks db-migrate.mjs
  for EVERY seat, not just me.
- Did NOT add these to `scripts/known-migration-ledger-exceptions.json` myself -- I cannot
  verify from outside CC-1's own session whether those 5 migrations' DDL actually ran (the
  mirror ledger can lie in the "already done" direction per the script's own comment), and that
  is CC-1's own in-flight work, not mine to declare safe unilaterally.

Filed MIGR-COLLISION-02 in docs/audit/GUARD-WORKORDERS.md (claim-reserve tooling only checks
the canonical ledger, not the mirror one CC-1 is writing to directly). Proceeding to build J-1/
J-2/J-3 code against the target schema now; will retry the live apply + live proof once this
clears, or once CC-1 confirms the 5 rows are safe to baseline. Migration file is committed at
db/migrations/202614950000_odometer_readings_gap_rows_and_date_grain_idemp.sql on
claude/r297-odometer-ledger-samsara-fault-poller, not yet applied.

## CC-3 — ROUND 297.1 SHIPPED (2026-09-30 ~19:55 CT) — PR #23493 merged

J-1 (odometer-snapshot.cron.ts), J-2 (odometer-manual.routes.ts), J-3 (fault-poll.cron.ts) all
built, wired into index.ts, guard shipped (verify-odometer-ledger-has-one-writer.mjs
--selftest). Migration 202614950000 applied live (see MIGR-COLLISION-02 below for why the
number changed twice).

PROOF 1 (adjusted): 16/16 active USMCA units got a row today (verified via created_at), 12
measured + 4 honest gap rows (T122/T147/T170/T173, confidence='suggested', odometer_miles
NULL). The order's literal query (WHERE read_at::date = CURRENT_DATE) returns 13, not 16 --
3 of the 4 gap units' last known position is itself several days stale, and read_at is
honestly set to that unit's own captured_at, never now(), exactly per spec. Not a bug.
PROOF 2: T173's gap row confirmed (odometer_miles NULL, confidence='suggested', read_at
2026-09-30T11:46:51Z -- its own last real position, not a placeholder).
PROOF 3: manual reading inserted through the REAL route handler (not a hand-rolled script) --
201, source='manual', confidence='entered', recorded_by_user_id = the real Owner account.
PROOF 4: UNVERIFIED this session -- J-3's decrypt step needs the real
SAMSARA_TOKEN_ENCRYPTION_KEY, which exists only in Render's deployed environment; no tool this
session has access to can read an existing Render secret value (update_environment_variables
is write-only). What IS proven live: the never-swallow-a-tick policy fires correctly (threw
instead of silently continuing when decryption failed), and maintenance.samsara_fault_code_
history stayed at its 0-row baseline (no partial/silent write). Needs a post-deploy check.

MIGR-COLLISION-02 (new, filed in docs/audit/GUARD-WORKORDERS.md): the claim-reserve tooling
(CLAIMED-MIGRATION-NUMBERS.json + verify-migration-claimed-on-main.mjs) only checks the
canonical ledger (_system._schema_migrations), not the mirror one
(ih35_migrations.applied_migrations) CC-1 appears to write to directly and rapidly. Burned two
claimed numbers live in under 20 minutes this way (202614790000 then 202614820000) before
landing on 202614950000, well ahead of CC-1's observed pace at the time. Worth CC-1/Lead
closing the gap in the claim tooling itself so the next seat doesn't repeat this.

Also found and left unfixed (pre-existing, unrelated, named not chased): the unscoped version
of the new date-grain unique index cannot be created at all -- 921 duplicate
(operating_company_id, unit_id, day, source) groups already exist across 176,960 of
odometer_readings' 177,906 historical rows, all source='samsara', written by some now-retired
high-frequency poller with no trace left in the repo. Worked around with a PARTIAL index
(rows from this migration's apply date forward only); the historical duplication itself is
someone else's call if it ever needs cleaning up.

## CC-3 — ROUND 299 (ALL SEATS linkage law + anti-drift) — read, acknowledged, no CC-3 action item

Read in full. L-1/L-2 (linkage guard + constraint trigger) = CC-1. L-3 (repair the 52) = CC-2.
H-3 (migration apply path) = CC-1. H-4 (guard ratchet) = Codex. H-1 needs the owner's own GRANT.
Nothing in this round is assigned to CC-3 by name.

ONE SELF-FLAG for the record (transparency, not asked for but relevant to H-3): Round 297.1's
migration (202614950000) was applied by a hand-rolled script, not applyMigration() -- because
db-migrate.mjs's own LV-087 check was refusing EVERY seat at the time (the same incident H-3
and PR #23496 are about). My script deliberately replicated applyMigration()'s own apply+ledger
logic exactly (BEGIN, run the SQL, write BOTH _system._schema_migrations AND
ih35_migrations.applied_migrations with a real checksum, COMMIT) rather than writing the mirror
only -- so it did not create a new canonical/mirror divergence of the kind H-3 names. Still,
H-3's new standing rule ("no seat applies a migration to production by any path other than
applyMigration()") is unconditional going forward, issued after this happened -- noted, and
applyMigration() only from here on.

## CC-3 — ROUND 300 T-23 SHIPPED — real assignment coverage, 16-unit fleet, 90-day window

MEASURED LIVE (br-fancy-credit-akjnd07a, USMCA, telematics.vehicle_driver_assignments, excludes
the 5 coder test artifacts T120/T149/T150/T151/USMCA-001 per CC-2's T-22 finding):

  unit   covered/90  pct
  T122        0/90    0.0%   <- ZERO assignment rows, ever
  T124        0/90    0.0%   <- ZERO assignment rows, ever
  T147       68/90   75.6%
  T148       24/90   26.7%
  T152       54/90   60.0%
  T156       18/90   20.0%
  T163       33/90   36.7%
  T164       59/90   65.6%
  T168       53/90   58.9%
  T170       46/90   51.1%
  T171       44/90   48.9%
  T173       66/90   73.3%
  T174       48/90   53.3%
  T175       38/90   42.2%
  T176       66/90   73.3%
  T177       69/90   76.7%

FLEET AGGREGATE: 686/1440 unit-days = 47.6% over the trailing 90 days.

T122 and T124 have NEVER had a vehicle_driver_assignments row -- not a gap in an otherwise-covered
history, a complete absence. T122 also has no live odometer (Round 297.1's own T-25 target) and no
fault-poll-relevant driver pairing either; T124 by contrast DOES have a fresh position/odometer
reading today (815317.3 mi), so its gap is specifically the driver-pairing feed, not the GPS feed
-- two different failure shapes wearing the same "0 assignment rows" symptom.

Every driver attribution in the app (settlement linkage, fault-WO assignment, the fuel-linkage law
just closed in T-22/L-3) resolves through this table. A quarter of the fleet at less than 50%
coverage, with 2 units at flat zero, is the real input number the next attribution job should be
measured against -- not "52 of 52 fuel rows resolved," which only proves the driver+load were
already known, never that the assignment table itself is populated going forward.

GUARD: scripts/verify-assignment-coverage-excludes-test-units.mjs + --selftest. Exports
measureAssignmentCoverage() (the live query, reusable) and the shared KNOWN_TEST_UNIT_NUMBERS
list, so no future report re-derives its own test-unit exclusion and risks CC-2's original
15-work-order mixup a second time.

MEASURED ONLY, nothing changed: no assignment rows written, no backfill attempted. T-23 asked
for the number, not a fix.

## CC-3 — ROUND 300 T-24 — status: BUILT, NOT YET PROVEN (correctly blocked on clock time)

J-1 is coded, merged, and manually invoked live against production in Round 297.1 (16/16 units,
12 measured + 4 honest gap rows, read_at = captured_at proven not now()). That is NOT the same
proof this item asks for -- the actual cron.schedule("0 3 * * *", ...) tick has not fired yet.
Current time at this report: 2026-09-30 16:1x CT. The next real 03:00 CT tick is tomorrow
morning. Will paste rows written + the T122/T147/T170/T173 gap rows + read_at once that tick
actually lands, not before. Reporting this honestly rather than re-presenting the Round 297.1
manual-invocation proof as if it were the scheduled tick.

## CC-3 — ROUND 300 T-25 SHIPPED — the four trucks with no odometer, cause named per unit

MEASURED LIVE (br-fancy-credit-akjnd07a, telematics.vehicle_locations, all-time per-unit history):

  unit   samsara_vehicle_id mapping     last odometer    last ANY position   cause
  T122   MISMATCHED (see below)         2026-07-01       2026-09-26 (4d stale) truck went dark independently, ~2 months before the fleet-wide incident
  T147   correct, single id             2026-08-26       2026-09-09 (21d stale) fleet-wide incident, never recovered
  T170   correct, single id             2026-08-26       2026-09-29 (1d stale)  fleet-wide incident, never recovered
  T173   correct, single id             2026-08-26       2026-09-30 (fresh)     fleet-wide incident, never recovered

THREE OF FOUR (T147/T170/T173) stopped reporting odometer on the EXACT SAME DATE -- 2026-08-26 --
which is the already-documented fleet-wide "stats types degraded fallback" incident named in
samsara-positions.service.ts's own header comment (the WITH-META fix that restored odometer for
most of the fleet afterward). GPS/position kept flowing normally for all three afterward -- this
is NOT a mapping problem (samsara_vehicle_id in mdata.units and the integrations.samsara_vehicles
mirror agree for all three) and NOT a full feed outage (position never stopped). It is specifically
these 3 units' OBD/odometer stat that never came back online on Samsara's side after the platform
incident that took the whole fleet's odometer down, while 12 of 16 units DID recover. Points at a
per-vehicle Samsara-side re-pairing/resync need, not anything in our own polling code (one batched
call treats every vehicle identically; these 3 are the exception, not the rule).

T122 is a DIFFERENT, older, two-part problem:
  (a) its last odometer (2026-07-01) predates the August 26 fleet incident by ~2 months -- a
      separate, earlier failure, not the same event as the other three.
  (b) mdata.units.samsara_vehicle_id carries a STALE/WRONG id (212014918407330 -- last reported
      2024-08-21, 2 years ago, 3 rows total, 0 with odometer) while the ACTUALLY active id
      (212014918197571, name "T122 (R)" in Samsara, 3,329 rows through 2026-09-26) lives only in
      the integrations.samsara_vehicles mirror. loadUnitIdBySamsaraVehicleId() prefers the mirror
      first, so this mismatch is currently HARMLESS at runtime -- but it is a real landmine for any
      future code that reads mdata.units.samsara_vehicle_id directly instead of through the
      mirror-aware resolver, and worth CC-1/whoever owns mdata.units correcting.
  T122 has also stopped sending ANY position (not just odometer) for 4 days as of this report --
  consistent with "(R)" meaning a reserve/idle unit, not an active data-feed bug.

REMAINING: no code changed here (measurement/diagnosis only, per the item's own ask -- "find out
why... name the cause"). No new guard for this one: the root cause for 3 of 4 lives on Samsara's
own platform side (a per-vehicle OBD re-pairing), not something this repo's code can detect or
fix structurally beyond what integration_sync_log already would catch if it degraded further. The
T122 mdata.units.samsara_vehicle_id staleness is a one-row data-correction candidate for whoever
owns mdata.units -- named here, not touched, since it is currently harmless and outside a
measurement task's scope to unilaterally correct.

## CC-3 — ROUND 300 T-27 SHIPPED — 921 duplicate groups registered as known debt

Registered ODOMETER-DUP-01 in docs/audit/GUARD-WORKORDERS.md: 921 duplicate
(operating_company_id, unit_id, day, source='samsara') groups across 176,960 of
telematics.odometer_readings' 177,906 historical rows. Retired writer confirmed to have NO
trace in the current repo (not in git log, not any registered cron/route) -- predates Round
297.1, which is the first CURRENT writer of this table. Worked around, not fixed: J-1's new
unique index is a PARTIAL index (migration 202614950000) scoped to rows from Round 297.1's
apply date forward; the historical duplication is untouched and its disposition is a separate
decision for whoever ends up owning this table's data quality.

## CC-3 — ROUND 300 T-26 — reaffirmed, still honestly UNVERIFIED

No change since Round 297.1's own report: J-3's fault-count proof remains UNVERIFIED, blocked
on SAMSARA_TOKEN_ENCRYPTION_KEY (Render-only secret, no tool this session can read it). Keeping
the word as-is per this item's own instruction -- not softening it. Will paste the live count
the moment the owner clears the key and a real tick completes.

## CC-3 — ROUND 300 T-28 SHIPPED — Samsara webhooks: never fired, here is why and what still covers it

MEASURED LIVE (br-fancy-credit-akjnd07a, USMCA):
  integrations.samsara_webhook_events        0 rows, ever (confirmed, matches the order's own number)
  audit_events 'integrations.samsara_webhook_signature_invalid'   0 rows, ever
  integrations.samsara_config (USMCA)        is_enabled=true, connected_at=2026-08-21, HAS a
                                              webhook_secret configured (92 bytes encrypted)

IS A WEBHOOK CONFIGURED ON THE SAMSARA SIDE? Cannot be answered directly -- that setting lives
entirely inside Samsara's own dashboard, which this session has no access to. But the evidence on
OUR side points one way: a webhook_secret IS stored for USMCA (someone completed the "paste the
secret Samsara shows you" half of setup), yet there is not even ONE rejected-signature audit row,
which our endpoint writes for EVERY request that reaches it with a bad/missing signature, BEFORE
persisting anything. Zero accepted AND zero rejected means no HTTP request has ever reached our
webhook endpoint at all -- not a signature mismatch, a complete absence of delivery attempts. That
is consistent with either (a) the matching half of setup -- actually creating a webhook subscription
in Samsara's dashboard and pointing it at our URL -- was never completed, or (b) it points at a
stale/wrong URL. Cannot distinguish (a) from (b) without Samsara-side access; naming both, not
changing anything on the vendor side per this item's own instruction.

WHAT THE POLLER NOW COVERS (from README_WEBHOOK_PROJECTION.md's own event-type table, cross-checked
against every currently-wired cron):
  vehicle.* (mirror), gps/location/position         COVERED -- samsara-positions.service.ts cron
                                                     (syncSamsaraVehicleLocations/Stats), plus
                                                     geofence + arrival detection (T-01, this
                                                     session), plus odometer (Round 297.1 J-1)
  driver.* / vehicle_assigned/unassigned pairing    COVERED, differently -- pairCurrentDriver()
                                                     inside the same stats cron reconciles current
                                                     assignment on every poll, a periodic
                                                     reconciliation rather than the webhook's
                                                     event-driven open/close, but the same table
                                                     ends up populated (see T-23's own coverage
                                                     numbers, which already reflect this path)
  hos / eld / duty_status                           COVERED -- initializeSamsaraHosPullCron,
                                                     wired and running independently of the webhook
  dtc / fault / diagnostic                          COVERED -- Round 300's own J-3 (fault-poll.cron.ts)

NOT COVERED BY ANY POLLER -- webhook-only, and the webhook has never fired:
  harsh / speeding / distracted / mobile_use / seatbelt   -> safety.harsh_events,
                                                              telematics.dashcam_clips
  safety.harsh_events has exactly 1 row, ever, and it is raw_samsara_id='TEST-TESTMTDQ4UCF' -- a
  fixture row, not real data. telematics.dashcam_clips has 0 rows. The only caller anywhere in the
  repo of processHarshEventsFromVehiclePayload() (safety/harsh-events-ingestion.service.ts) is
  webhook-projectors/vehicle-projector.ts -- no cron, no poller, nothing else invokes it. This
  means the ENTIRE harsh-driving-event and dashcam-clip-auto-linking pipeline has been completely
  dark since it was built: every harsh brake, speed event, distracted-driving flag, phone-use flag
  and seatbelt event Samsara has ever detected on this fleet has gone unrecorded, because its only
  ingestion path depends on a webhook that has never delivered a single request.

REMAINING: reported per this item's own instruction ("change nothing on the vendor side"). No
code changed. Whoever owns safety/telematics should decide whether harsh-event coverage needs a
polling fallback (Samsara's stats/vehicle endpoints do carry some harsh-event data in other
integrations, not confirmed available on this account's plan) or whether fixing the webhook
delivery (Samsara-dashboard-side, outside this repo) is the intended path -- that decision is
outside a "report, change nothing" task.
