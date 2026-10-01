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

---

# LINKAGE LAW §10-B — THE COMPLETE TARGET LIST (owner law 2026-10-01 11:25 CT / 16:25Z — "update all law docs so nothing is ever left out again")

Every record a coder creates, migrates, posts or renders links BOTH WAYS (forward FK on the record, reverse drill from the target) to EVERY applicable target below. A block that does not declare each target as LINKED or N/A(reason) is not done. Silence is a defect. This list is canonical in docs/trackers/01-LINKAGE-LAW.md and mirrored verbatim into every law doc; a change is made in all of them in the same commit.

**Parties:** customer (mdata.customers) · vendor (mdata.vendors) · driver (mdata.drivers; drivers-as-vendors where they are paid) · factoring company (vendor) · lessor/lessee (org.companies + vendor/customer) · user/actor (identity.users).
**Assets & operations:** unit/truck (mdata.units) · trailer/equipment (mdata.equipment) · load (mdata.loads, canonical hub) · stop (mdata.load_stops) · tour (dispatch tours) · pre-settlement link (presettlement_link) · settlement (driver_finance.driver_settlements) · driver bill (driver_finance.driver_bills) · work order (maintenance.work_orders) · fuel transaction (fuel.fuel_transactions) · insurance policy / claim · safety event / incident · legal contract / contract instance / legal matter · lease contract (accounting.lease_contract) · document (docs.files / documents.attachments).
**Money:** invoice + invoice line (A/R subledger; accounting.invoices / invoice_lines) · customer payment + application · bill + bill line + bill payment (A/P subledger; accounting.bills / bill_lines / bill_payments) · expense + expense line · chart-of-accounts account (catalogs.accounts; income / expense category / control role) · item or product/service (items) · class (catalogs.classes) · journal entry + postings (accounting.journal_entries / journal_entry_postings, source_transaction_type + id + line id) · bank line (banking.bank_transactions match + categorization) · deposit · transfer · factoring purchase / advance / reserve (escrow + cash) / fee / chargeback · escrow / cash advance / deduction / reimbursement · period (open/closed).
**Stamps (every record):** created_at + created_by · updated_at + updated_by · the business dates that apply (pickup, delivery, issue, due, sent, signed, start, end, commencement, posted, paid, cleared, wire, purchase, voided, reinstated, closed, locked, approved) · operating_company_id on every table with FORCED RLS (identity.is_lucia_bypass() OR app.operating_company_id) · one audit row (audit.audit_events / audit.row_changes, WORM) per mutation · trace_no / trace_key where the table carries them.
**Mechanics:** server-generated display ids · pickers are ReferenceSelect with the full catalog dropdown + inline +Create (customer, vendor, driver, unit, trailer, account, item, class) · multi-select where the document covers several assets (a lease covers many units and trailers) · MoneyInput for money, DatePicker for dates · EntityLink on every rendered id · click on any payment received/made opens that transaction and its bank match (QuickBooks parity) · PDF print design per document type (contract, lease, invoice, settlement, purchase report) created, printable and sendable from the app · FEED GATE (driver_finance.feed_intakes / feed_intake_checks) runs before a fed subject closes.
**Never:** payroll.* · settlement.* · bank.* · maint.* · accounting.qbo_* · mdata.qbo_vendors · catalogs.cancellation_reasons (RETIRE tables) · test/sample/demo rows in USMCA · a money line without an account · a document without its line · a status without its stamp · a mutation without its audit row.
# ROUND 317 — 2026-10-01 12:25 CT (17:25Z) — LEAD REPLIES TO ALL OUTBOXES (owner: no drift, full complete builds)

## CC-2
1. ACCT-F9602 exemption CONFIRMED: `INVOICE_REVREC_LATCH_OWNS_LOAD` from the poster is the design for latch-recognized loads (Event 2 posts the A/R on the same send), not a failure. Keep that single named exemption; every other poster failure still refuses the send. Add the exemption to verify-feed-gate-blocks-incomplete's expectations in your PR so the guard reads it.
2. "CR A/R per invoice" in ROUND 315 was a wording error — CONFIRMED. Secured borrowing (ASC 860, recourse): A/R is NOT relieved at purchase; the purchase engine posts the CPA/locked way (DR cash/undeposited + reserves + fees, CR Factoring Advance liability). Company absorbs chargebacks; recourse 95 days.
3. 90007 deleted (AUTH-197) — accepted. The FLS pair 13513 / 13515 ($525.00 each, PO 5772267 vs 005772267) is an OWNER decision; Lead has put it to the owner. Do not touch either until ruled.
4. Continue step 2 (purchase document + one posting engine) and the Submit tab. 13626/13637 invoices: AUTO-INVOICE-ON-BOL is waiting for the BOL documents — correct by design; the owner uploads the BOLs, the engine issues the invoices, I2 clears. Do not force it.

## CC-3
1. Good: both loads auto-delivered through the canonical transition under the geofence flag (16:41:10Z), driver bills DB-000266 / DB-000275, Event 1 JEs.
2. Double Event 1 on 13626 ($3,400 overstated): your #23823 fix accepted; the void goes to CC-1 (below). Keep auto-status ON for the geofence path; master sync / prompts / geofence push stay OFF.
3. AlwaysTrack parity required-CI skip is yours: make verify-alwaystrack-parity execute in CI with proof (no skip), today.
4. Continue E-31 → E-23 → E-30 → E-32 → geofence webhook feed, each total with §10-B linkage and Chrome proof.

## CC-1
1. VOID the extra Revrec Event 1 JE `4c416f76-a2a1-4000-88e2-e3fc39b3d0c4` (load 13626, Dr 1150 / Cr 4000, $3,400.00, 16:24:05Z, from CC-3's test run) through the canonical reversal under one AUTH; keep `de792d44` (the engine's). Paste the reversal JE and the 13626 revenue net ($3,400.00 once).
2. ROOT FIX: postLoadRevenueLatch must be idempotent per (load, Event 1) — one live Event 1 JE per load, enforced in the poster (idempotency key on load + event) + guard. Money lane, yours.
3. T122 / T124 / T156 (IH 35 TRANSPORTATION-owned trucks on USMCA): OWNER RULED all units are leased to USMCA — these three are leases with TRANSP as lessor (ROUND 316 already allows lessor = TRK or TRANSP). Keep them attached; they leave the baseline when the owner creates their backdated lease contracts in the app. No re-own, no deactivate.
4. The 38 USMCA test survivors in maintenance tables (work_orders 15, severe_repair_estimates 14, parts_inventory 5, road_service_tickets 2, pm_intervals 1, pm_schedules 1): Lead purge, snapshot first, under AUTH — queued after the Lead's Chrome pass. CC-1 deletes nothing — correct.
5. Lease engine ROUND 316 AMENDED continues: multi-select units/trailers, lessor vendor, monthly bill engine, contract FKs, ReferenceSelect pages, PDF designs. Gate hygiene: measured_at on every baseline, requireLiveDbOrExit on every live guard.

## CURSOR
1. Handwritten service-charge JE cf78c2aa: reverse + re-post as an expense document (ruling 17:20Z) — first.
2. "16 ambient main verify-static failures" blocking your push: list all 16 by guard name + file in OUTBOX-CURSOR within the hour so the Lead assigns each to its owner; do not --admin past them and do not patch baselines.
3. Then ROUND 313 items 2–3 (factoring designs for CC-2's engine; maintenance designs per the approved screens) and the Chrome pass owed.

## OWNER DECISIONS NEEDED (Lead → owner)
- 13513 vs 13515 (FLS Transportation Services Ltd / FLS Transport Inc., both $525.00, PO 5772267 vs 005772267, 08-12→08-13 vs 08-13→08-14; 13513 invoiced, 13515 closed): which is real?
- BOL documents for loads 13626 and 13637: upload them (load → docs) so the engine issues their invoices.
