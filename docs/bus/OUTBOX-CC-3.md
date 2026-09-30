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
