# ORDERS 2026-10-01 — COMMON TO EVERY SEAT (read first, then your own file)

OWNER, verbatim, 2026-10-01:
- "THE BUILDS IN MAINTENANCE ARE NOT READY, CUSTOMERS, VENDORS, AND DRIVER PROFILE."
- "I TOLD YOU NOT TO SEED ANYTHING YET AND NOBODY SHOULD BE ADDING OR CREATING ANYTHING YET, THEY
  ARE ALL SUPPOSED TO ONLY BUILD FULLY AND TOTALY, ONCE FULY AND COMPLETE ALL ENGINES WE WILL SEED."
- "CODEX NEVER DOES ANYTHING" — Codex is not a seat. Route nothing to it, wait on nothing from it.

STANDING RULES (unchanged, now in one place)
1. USMCA only (5c854333-6ea5-4faa-af31-67cb272fef80). TRANSPORTATION / TRUCKING frozen.
2. BUILD, DO NOT WRITE DATA. No seeding, no invoices, no settlements, no stamps, no status
   changes, no merges of records, no deletes. Engines that WRITE as their function (fence events,
   stop captures, DVIR import, scorecards, derived attributes) ship behind a flag that defaults ON
   only when the write is the engine's own output table; anything that touches a business record
   (loads, stops, invoices, bills, drivers, units, fuel source fields) ships flag-OFF and the Lead
   carries the switch to the owner. When in doubt: flag OFF + report.
3. Every engine: numbered (sheet 1 of docs/engines/IH35-ENGINE-REGISTRY-2026-10-01.xlsx), one
   owner, 100% done before the next, additions only after DONE. Sequential, top to bottom.
4. Linkage law: every new row links both ways to its hubs (org.companies, identity.users,
   mdata.drivers, mdata.units, mdata.loads, mdata.customers, mdata.vendors, catalogs.accounts,
   maintenance.work_orders, docs.files, accounting.journal_entries). A PR with no linkage
   declaration is not done.
5. Time: America/Chicago on every cron, every stamp shown to a human, every report. UTC in storage.
6. Cost discipline (RULES R-06): no engine polls Samsara/Relay/Google on its own schedule unless the
   registry says so; read what is already on disk. PM runs once daily. Nothing every minute.
7. Never a second engine for the same fact. Geofence state = geo.geofence_events via
   processGeofenceDetectionsForGpsPoint (Lead ruling 2026-10-01). Odometer = Samsara reading or
   ABSENT, never interpolated. Driver at time = driverAtTimeSql, never re-inlined.

GATE RECIPE (Mac, from your worktree) — stop guessing at env:
  SEAT=<CC-1|CC-2|CC-3|CURSOR> SKIP_LIVE_NETWORK_CHECKS=true \
  DATABASE_URL=<READONLY GATE CREDENTIAL> DATABASE_DIRECT_URL=<same> \
  [LANE_CROSS=<ruling filename in docs/bus/>] node scripts/money-pr-local-gate.mjs
  - The readonly credential (ih35_ci_readonly) cannot SET ROLE; a guard that does is a guard bug —
    report it, the Lead fixes it (two fixed today).
  - Any .sql in your diff runs EVERY live-domain guard. Live guards red today, not yours to fix:
    verify-costs-are-expenses-not-handwritten-jes (3 "Bill posting" JEs, Lead investigating),
    verify-purge-era-closures-still-hold (REPORT-ONLY). If one of these is the ONLY red, say so in
    OUTBOX and the Lead merges with --admin after reading the log. Never widen a baseline yourself.
  - Commit first line: `FINDING: <ID or N/A> LANE: <FINANCIAL|NON-FINANCIAL|DOCS> (<what>)`;
    body: DOD-A, MIGRATE, ROOT CAUSE, FIX, GUARD, REMAINING, single-line LIVE PROOF naming exit 0,
    the sha, the endpoint or row, the count.
  - Migrations: claim the number FIRST (fetch origin/main, anchored text insert into
    db/migrations/CLAIMED-MIGRATION-NUMBERS.json, claim-only PR on chore/claim-reserve-*), merge,
    THEN author the .sql on a lane-prefixed branch (cc-1/ or claude/ for HH 00–11). db:migrate
    runs on every backend deploy (pre-deploy command) — the Lead deploys; you never "wait on the
    owner's migrate".
  - Bus: NOW-<SEAT>.md ≤ 4096 bytes. Your report goes to OUTBOX-<SEAT>.md, one block per PR:
    what · proof (sha, gate exit, live row) · blocker (exact: table, flag, AUTH, seat) · next.

ANTICIPATED BLOCKERS AND THE ANSWER (do not stop for these):
- "E-03 table not live yet": telematics.unit_stop_events lands with the Lead's next deploy. Code
  against db/migrations/202615030000_unit_stop_events.sql (Lead branch; columns: unit_id,
  started_at, ended_at, dwell_minutes, lat, lng, city, state, odometer_mi, odometer_read_at,
  odometer_age_minutes, odometer_note, miles_since_previous_stop, miles_note, geofence_id,
  geofence_label, geofence_kind, geofence_distance_metres, driver_id_at_time, load_id_at_time).
  Feature-detect the table (information_schema) so your cron no-ops with a logged reason until it
  exists — never crash boot.
- "needs owner AUTH": write the dry run (rolled back) + exact row ids + the one-line order you
  need to OUTBOX; the Lead carries it. Move to the next row. Never apply.
- "needs another seat's endpoint/field": write the exact field, type, endpoint and example row to
  OUTBOX-<you>.md addressed to that seat; build everything around it; never stub it as if live.
- "CI red on main": known — readonly DB secret stale in GitHub Actions (owner updates), fresh-db
  pm_intervals FK (CC-1 row 7). Local gate exit 0 + Lead --admin merge is the path until fixed.
- "Chrome proof": the Lead does the Chrome pass; DONE = sha until then. Keep building.

## 2026-10-01 LATER — SUPERSEDED IN PART
Ruling docs/bus/2026-10-01-LEAD-RULING-EACH-SEAT-BUILDS-ITS-ENGINE-END-TO-END.md (owner: no handoffs) withdraws every line in these ORDERS files that routes work to another seat. Each seat builds its own engine end to end: migration (own band), backend, screen, guard. Read the ruling.

## 2026-10-01 OWNER LAW — MONEY PAUSE LIFTED · ROOT FIXES ONLY
Read `docs/bus/2026-10-01-OWNER-LAW-MONEY-PAUSE-LIFTED-ALL-SEATS-BUILD-EVERYTHING.md`. Owner, verbatim:
"all coders are to build completely fully economics, financial, mechanical money, etc., full linkage etc."
and "fix all issues at root, we do not patch, nor defer, we fix permanently." Every money engine on your
list is ON. Nothing is paused except seeding (owner seeds) and handoffs (you build your own). A blocker is
fixed at its root in the same PR — no skip flags, no hidden baseline bumps, no TODO, no "deferred".
