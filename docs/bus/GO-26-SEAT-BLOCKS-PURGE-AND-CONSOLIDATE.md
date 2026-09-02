# GO-26 — SEAT BLOCKS · PURGE TO ZERO, THEN CONSOLIDATE
**Owner ruling 2026-09-02:** *"these transactions are not real. they should be voided and deleted because we are starting with 0. i will create the first real load and begin the month's real expenses."*

**Method is settled: VOID FIRST, THEN DELETE.** The void writes the register; the delete gets you to zero. No seat may skip the void, and no seat may stop at the void.

**Reconciliation is CLOSED.** Claude and Cursor have reconciled. No seat reopens the inventory, re-derives a count, or files another register. Build.

---

## CC-1 — INBOX

```
CC-1 — GO-26 PURGE USMCA TO ZERO — OWNER ORDER 2026-09-02

Jorge is starting from zero. He enters the first real load and the first real
expenses himself. Every transaction now in USMCA is a test, sample, demo, probe
or hop. None of it is real.

METHOD — VOID FIRST, THEN DELETE. Both. In that order.
  1. Write the void: voided_at, voided_by_user_id, void_reason =
     'GO-26 OWNER PURGE 2026-09-02 — non-real fixture, entity reset to zero'
  2. Where the table has void_reversal_entry_id and a JE exists, write the
     reversing entry and link it.
  3. THEN delete the row.
The void is the register. The delete is the owner's order. Do not stop at 1.
Tables with no void columns: record the row to the purge ledger file, then delete.

SCOPE — USMCA ONLY, 5c854333-6ea5-4faa-af31-67cb272fef80.
TRANSPORTATION and TRUCKING are frozen. Do not read them. Do not touch them.

ORDER — children before parents, or the FK will stop you:
  postings -> batches | lines -> headers | matches -> sessions
  splits -> transactions | events -> accounts

ONE PR PER SCHEMA, in this order:
  accounting -> driver_finance -> banking -> factoring -> dispatch -> fuel
Your migration lane is 00:00-11:59 UTC. Cursor holds 12:00-23:59.

THE BIG ONES (live counts, verified 2026-09-02):
  dispatch.load_id_reservations        5,875   burned load numbers
  accounting.posting_batches             607
  banking.reconciliation_matches         118
  accounting.recon_runs                   66
  accounting.outbox_events                43
  accounting.prepaid_amortization_rows    15
  accounting.escrow_postings               6
  driver_finance.driver_liabilities        5
  dispatch.border_crossing_events          5
  plus ~30 tables holding EXACTLY ONE ROW each — the probe signature.
  Full list: docs GO-26-PURGE-TO-ZERO-AND-CONSOLIDATE-2026-09-02.md

LOAD RESERVATIONS — RESET, DO NOT ONLY DELETE.
After clearing dispatch.load_id_reservations, reseed lib.trace_counters.
SEED LOCKED (owner 2026-09-02 UNLOCK):
  DELETE stale doc_type = 'LD' row if present.
  KEEP doc_type = 'LOAD' only (allocateNextLoadNumber queries 'LOAD').
  Set last_trace_no = 13556 so next auto-mint = 13557.
  Load 13508 STAYS (owner real, Indianapolis→Laredo). is_sample_data = false.
  August numbers typed from IH35-USMCA-AUGUST-ONE-SHEET on Desktop.
  Skip Transportation gaps (13509, 13515, etc.) — Jorge types manually.
Source: IH35-USMCA-AUGUST-ONE-SHEET.xlsx on Desktop. Clearing 5,875 reservations
without reseeding leaves the next number wrong.
Settlement numbers in sheet start ~5769 — do NOT invent settlement seed unless doc
says; note for later GO-22.

ESCROW — Jorge ruled it WIPED. escrow_ledger, escrow_postings, escrow balances
all to zero. This closes the item the 2026-09-01 register called the most
serious thing on the list.

SAMPLE DRIVERS — DELETE. Jorge: "we do not need sample drivers."
  DELETE the 2 rows in mdata.drivers where is_sample_data = true.
  The earlier HOLD is lifted. He has ruled.

DO NOT TOUCH:
  Load 13508 — REAL, is_sample_data = false, owner-entered. It stays.
  banking.bank_transactions (395) — Jorge's explicit exception. They stay,
    uncategorized, December 2025 forward.
  All config and catalog tables — chart of accounts (365), accounting periods
    (24), driver_pay_rates (91), customer_factor_assignment (1,221),
    bank_accounts (5), expense_category_account_map (33), transaction_categories,
    fixed_asset_classes, escrow_settings, auto_deduction_policies,
    settlement_posting_config, fuel_planner_settings, vendor/customer
    classifications, sales_tax_agencies, intercompany_entity_pairs, factor.
  telematics.vehicle_locations (40,572) and vehicle_driver_assignments (55)
    — GPS history, not transactions.
  Zeroing a config table breaks the software. Full keep-list in the doc.

REPORT, DO NOT GUESS — three tables read as config but sit in a money chain:
  accounting.escrow_accounts        21
  driver_finance.driver_advance_accounts  12
  driver_finance.escrow_balances     3
Jorge's CPA answers say each driver automatically gets an asset and a liability
account when hired, as a sub-account. If these 36 rows are those per-driver
accounts for REAL drivers, they are config and they STAY. If probes made them,
they go. Report which, with the driver each row points at. Do not decide.

DONE-GATE — paste this, and every row must be gone except the keep-list:

SET LOCAL app.bypass_rls = 'lucia';
SELECT tbl, n FROM (
  SELECT c.table_schema||'.'||c.table_name AS tbl,
    COALESCE((xpath('/row/cnt/text()', query_to_xml(format(
      'SELECT count(*) AS cnt FROM %I.%I WHERE operating_company_id::text = ''5c854333-6ea5-4faa-af31-67cb272fef80''',
      c.table_schema, c.table_name), false, true, '')))[1]::text, '0') AS n
  FROM information_schema.columns c
  JOIN information_schema.tables t
    ON t.table_schema = c.table_schema AND t.table_name = c.table_name
   AND t.table_type = 'BASE TABLE'
  WHERE c.column_name = 'operating_company_id' AND c.udt_name = 'uuid'
    AND c.table_schema IN ('accounting','driver_finance','banking','factoring','dispatch','fuel','telematics')
) s WHERE n <> '0' ORDER BY n::bigint DESC;

Paste it BEFORE and AFTER. Not a description of it.

NEVER create a record in USMCA — not to test the purge, not for proof.
FAST-MERGE law applies: gate exit 0 -> push -> PR -> merge -> Neon -> next.
Neon is step 5, AFTER the merge. Never before the push.

NEXT after the purge: GO-22 settlement spine, and the per-user column
preference table (GO-26 part 4.4).
```

---

## CC-2 — INBOX

```
CC-2 — GO-26 CONSOLIDATION GUARD, TODAY — THEN PICKERS TO ZERO

Jorge ruled: consolidate so every screen gets fixed at once.

STEP 1 — THE GUARD SHIPS FIRST. Today. Before one conversion.
Ratchet pattern, same as verify-ui-design-system-ratchet.mjs — fails only when
a count goes UP. Fail the build on any NEW:
  - import of components/shared/SelectCombobox
  - import of components/parity/EntityPicker
  - import of components/shared/Combobox
  - import of components/DataTable
  - import of components/shared/ResizableTable
  - import of components/shared/MobileOptimizedTable
  - raw <table> outside the 6 infrastructure files
  - raw text-[Npx] off the locked scale (11 / 12 / 22)
Commit today's counts as the baseline. NEVER raise a baseline to pass.

WHY FIRST: you are about to change 277 files. Without the guard, new violations
get written the whole time you work and the count never reaches zero. That is
exactly how 2,213 hardcoded sizes and 277 trapping pickers accumulated.

STEP 2 — PICKERS TO ZERO.
  KEEP    components/Combobox.tsx        43 files   dismisses on outside click
  RETIRE  shared/SelectCombobox         158 files   no handler
  RETIRE  parity/EntityPicker           111 files   no handler
  RETIRE  shared/Combobox                 8 files   no handler
  TOTAL TRAPPING: 277 — UP from 268 while this row sat assigned.

Ship in batches BY DIRECTORY, one PR each. A 277-file PR cannot be reviewed and
cannot be reverted cleanly. Report after every batch: "K2: 277 -> N".
Delete a retired component only when its import count reaches ZERO. A component
with one importer left is not retired.

This also closes B9 (pickup/delivery State is a plain input, not a filter-combo).

STEP 3 — J1 to zero. 1,015 off-scale across 331 files. 202 of those files carry
only 1-2 occurrences. Section D first, then the top 50 files, then the tail.
docs/specs/GLOBAL-TYPE-SIZE-BASELINE.md is LOCKED since 2026-06-07 —
transcribe it, never propose a scale.
```

---

## CC-3 — INBOX

```
CC-3 — GO-26 TABLES: ONE COMPONENT, RETIRE THE OTHER THREE

Jorge ruled: consolidate. His standing instruction was that every table in the
app drags and resizes. ParityTable does it. The other three never will.

  KEEP    components/parity/ParityTable.tsx     373 files
          drag-resize, drag-reorder, auto-fit, persists per table
  RETIRE  components/DataTable.tsx
  RETIRE  components/shared/ResizableTable.tsx
  RETIRE  components/shared/MobileOptimizedTable.tsx
  CONVERT 43 files still rendering a raw <table>

WAIT for CC-2's guard to land before you start converting. The guard stops new
raw tables being written behind you.

CONVERSION RULES:
  1. Keep every existing column, same order, same formatting. A conversion that
     loses a column is a regression, not a fix.
  2. Give each table a STABLE storageKey. Change the key and the operator loses
     their saved layout.
  3. STOP RULE — financial statements (Balance Sheet, P&L, Trial Balance, Cash
     Flow) have indented section rows and subtotals. If ParityTable cannot
     express a subtotal row, SAY SO IN YOUR OUTBOX AND STOP ON THAT FILE.
     Do not flatten a financial statement into a flat grid to make it fit.
  4. One PR per wave. Live Chrome screenshot per wave showing a column dragged
     and resized on a converted screen.

WAVE ORDER — Jorge's daily screens first:
  1 DispatchBoard · TripPairingBoardPage · PlannerCalendarPage · BookLoadModalV4
    WorkOrdersTable · WorkOrdersConsoleListPage · FleetTable · FleetOosStrip
    DriverSchedulerGridPage · TaskPlannerGrid
  2 money screens   3 reports   4 home and program

Delete a retired component only when its import count reaches ZERO.

Column headers, per the LOCKED baseline: 11px, weight 700, UPPERCASE, #4B5563,
CENTERED, and EVERY ONE SORTABLE. That is already locked — do not invent it.
```

---

## CASCADE — INBOX

```
CASCADE — GO-26 VERIFY THE PURGE. LIVE QUERY ONLY.

Reconciliation is CLOSED. Claude and Cursor have reconciled. Do not open a new
register, do not re-derive a count, do not file another inventory.

YOUR ONE JOB: after each CC-1 purge PR merges, run the GO-26 done-gate query
against live production under SET LOCAL app.bypass_rls = 'lucia' and publish
the delta. Which tables reached zero, which did not, what remains.

LIVE QUERY ONLY. Your void sweep was wrong in both directions because you
grepped db/migrations/*.sql instead of querying the database — you reported 17
tables with void columns when production had 91, and you reported 5 tables as
missing columns they already had, which nearly sent CC-1 to migrate columns
that existed. Migration grep is a hypothesis. The database is the finding.

State the count you swept and the count that exists, every time. If they differ,
that difference IS the finding.
```

---

## CODEX — INBOX

```
CODEX — GO-26 REINTRODUCTION GUARD + ORPHAN AUDIT

1. After CC-2's ratchet lands, write the guard that stops a retired component
   coming back: no new file may import DataTable, ResizableTable,
   MobileOptimizedTable, SelectCombobox, EntityPicker or shared/Combobox.
   PROVE IT FAILS: check out a commit before the fix, run the guard, show it RED.
   A guard nobody has seen red is a green light with no bulb. Then show it green.

2. ORPHAN AUDIT. PR #19677 landed with EIGHT guards written but never wired into
   anything that runs them, and a cargo guard that rejected a VALID maintenance
   worker. Audit every guard in the repo for exactly those two failure modes:
     - orphaned: is it actually invoked by a CI step or a pre-push hook? If not
       it is a file, not a guard.
     - false positive: does it reject valid input? A guard that blocks correct
       work gets disabled by whoever it blocks, and then it protects nothing.
   Report the list. Fix what is yours. Hand off what is not, by name.

3. DISPUTE TO SETTLE: GO-20 slice D (cargo sensor incidents) was reported BUILT
   in #19499 / #19502 / #19518. Live production has NEITHER
   telematics.cargo_sensor_incidents NOR telematics.cargo_sensor_readings.
   Verify against the database and report CONFIRM or DISPUTE with the query.
```

---

## CURSOR — INBOX

```
CURSOR — GO-26 LEAD

Reconciliation with Claude is CLOSED. Your inventory and mine are merged.
Disputes settled, corrections applied both ways. Nobody reopens it.

1. LANE CONTROL. CC-1 is running the GO-26 purge across accounting,
   driver_finance, banking, factoring, dispatch and fuel — migration-heavy, his
   window is 00:00-11:59 UTC. Yours is 12:00-23:59. Stay off those schemas
   while he works.

2. DEPLOY in batches of 5-10 merges. Never per-merge. autoDeploy stays OFF.
   You are the only seat authorized. After deploying, report the deploy ID, the
   SHA, and ONE live Chrome screen confirmed working — the deploy service
   reporting green is its claim, not proof the app works.

3. STILL YOURS, after the purge settles:
   - Slice 04: proforma mints at book (book-load.service.ts:1938). It must mint
     at first pickup completion instead. No pickup trigger exists yet.
   - Slice 05: accounting.bills.driver_uuid DOES NOT EXIST. trailer_id and
     recover_from_driver landed; the driver column did not. Jorge's road-repair
     scenario cannot work without it. This blocks the Load Costs board and the
     company settlement.
   - Slice 20: NO company settlement table exists. TripProfitability.tsx is a
     read view. The P&L tying to 2,415.11 cannot be proven against a table that
     is not there.

4. GO-07 KPI drill-through: DispatchOverview.tsx:277 computes
   atRiskCount + lateCount, so a load that is BOTH is counted twice, then drills
   to a page showing half of what the tile claimed. The tile value and the drill
   row count must be identical.
```

---

## AFTER THE PURGE — WHAT JORGE DOES

1. ~~Names the load number seed.~~ **SEED LOCKED:** next load number = **13509** (13508 stays; August one-sheet starts 13508). CC-1 reseeds `lib.trace_counters`.
2. Books the first real load in Chrome.
3. Enters the month's real expenses.

**From that moment every number in this software means something for the first time.** Nothing before it did, because everything before it was computed over fixtures.
