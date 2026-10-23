## 2026-10-23 ~11:30Z — CC-1 443.265-E3 SHIPPED

**PR #27310 MERGED** → squash `fb554db2` — 443.265-E3 cash flow source fix on main.

Root causes fixed (2 source errors in getRollingLedgerRows):
1. expensesPromise REMOVED — accounting.expenses status=posted = PAID cash/card at creation (944 USMCA rows, $353,241.23). Removed from Promise.all (11→10 queries), row loop deleted.
2. billsPromise vendor-only — added AND b.bill_category='vendor'. Previously included driver bills ($125,693.97) causing vendor bills to show $126,437.22 instead of true vendor AP = $743.25 (3 rows).
3. Guard updated — verify-rolling-ledger-queries-parallel: count 11→10, selftest PASS (3/3).

After fix: vendor bills=$743.25 | driver bills=driver_finance.driver_bills only | Other=relay_topup only | Expenses=excluded (paid history).

# OUTBOX-CC-1

Archived 2026-10-17 — content moved to [archive/OUTBOX-CC-1-archive-2026-10-17.md](archive/OUTBOX-CC-1-archive-2026-10-17.md). Live seat orders: the Lead channel (LEAD-TO-SEATS).

## 2026-10-23 ~13:17Z — CC-1 443.265-E5 IN CI (PR #27318)

**PR #27318 OPEN, auto-merge ON** — 443.265-E5 driver-bill due_date = projected delivery + single-source cash flow
- E4 changes included (vendor bills COALESCE, partial-week diesel, null-due-date guard — also on E4 branch)
- DATA: accounting.bills driver due_date NULL BEFORE=174 AFTER=1 (1 unmatched #13530 load 7d52a20e $300)
- DATA: driver_finance.driver_bills accrued_bill_id BEFORE=0 AFTER=65 linked
- CODE: billsPromise bill_category='vendor' → IN ('vendor','driver')
- GUARD: verify-driver-bill-due-date-projected-delivery.mjs SELFTEST PASS 2/2
- preflight PASS, pushed branch, CI running


## 2026-10-23 ~09:55Z — CC-1 443.265-B SHIPPED

**PR #27277 MERGED** → squash `446c9e12` — 443.264 cash-flow fuel trailing 4-wk avg on main.

**PR #27286 MERGED** → squash `802fd8e9` — overdue bills AP-aging clamp + Driver/Vendor/Finance/Insurance sub-rows on main.
- Root: buildWeekBuckets consumed days[].expenses_due_cents (overdue bills → carry_over → invisible). Fixed with AP-aging clamp on data.rows + expenseCategory() classifier.

**PR #27287 MERGED** → squash `fc0a287e` — D074 truck-line Promise.all + units-without-load DISTINCT ON CTE on main.

## 2026-10-22 ~15:30Z — CC-1 443.232 UPDATE: PR #27168 MERGED + PR #27171 in CI

**PR #27168 MERGED** → squash `acafc4f330` — void cascade fixes (b/c/d) are on main.

**PR #27171** (`cc-1/443-232-cancelled-leg-revenue`, CC-1e): tour-readout cancelled-leg TONU revenue fix in CI. `lc_is_invoiced` now projected into legsRes; cancelled+no-invoice=0, cancelled+invoice=actual_revenue.

**CC-1d (P-0102) still BLOCKED** — needs owner authorization to void settlement P-0102 ($379.73 USMCA closed, source_document_ref=5796, id f54afddb). No code change possible; verify-settlement-net-matches-signed-doc will remain RED until owner voids it.

**CC-1e 443.218 KPI** — pending after PR #27171 merges.

## 2026-10-22 ~16:15Z — CC-1 443.234 CLOSE-OUT

### 443.234a — 3 stale presettlement_link_id CLEARED (TB = 0)

Run via Neon MCP bypass_rls=lucia on USMCA prod. UPDATE RETURNING = 3 rows:
- Load 13663 (`0c7bb7ba`) → presettlement_link_id = NULL ✓
- Load 13544 (`0b95a971`) → presettlement_link_id = NULL ✓
- Load 13563 (`4b89d970`) → presettlement_link_id = NULL ✓

Both settlements (df6b3c83, 9580bec8) were status=cancelled, voided 2026-10-16. Step 8 of the cascade engine was added in PR #27137 and did not retroactively clear loads voided before that PR. Manual repair applied.

Zero-count verify:
```sql
SELECT COUNT(*) AS stale_count FROM mdata.loads
WHERE presettlement_link_id IN (
  'df6b3c83-643e-428e-a884-62b9013cae18',
  '9580bec8-2569-48ac-a931-e4ae6924edb0'
) AND operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80'
  AND soft_deleted_at IS NULL
-- Result: stale_count = 0 ✓
```

### 443.218 KPI remainder — PR #27176 in CI

Branch `cc-1/443-218-kpi-total-count` → PR #27176 (preflight PASS, CI running).
- factoring-queue route: COUNT(*) OVER () → real total
- factoring.routes.ts: 4 instances (recourse-pipeline, chargebacks-fees, unapplied-cash, invoice-status)
- New guard: `scripts/verify-kpi-total-not-rows-length.mjs` + wired to locked-guards-heavy
- SURFACE-BREACH-AUTHORIZED: CC-2 (factoring/**) per LEAD 443.230 item-e

### P-0102 — OWNER HOLD (DO NOT VOID per LEAD 443.234 15:50Z)

Settlement P-0102 ($379.73, USMCA, source_document_ref=5796, status=closed). No action.

## 2026-10-23 ~07:58Z — CC-1 443.264 STATUS: push in flight (pre-push hook running)

**Branch:** `cc-1/443264-cash-flow-fuel-trailing-avg`  
**Commits:** 4 commits on top of `49e681d3c3` (origin/main)

### Item 1 (backfill) — DONE (prior PR #27263 merged)
- 145/145 driver bills stamped `due_date = load delivery date`
- guard 18681 PASS 190/190 (::text cast fix landed in current PR)
- bill 13688 data patch (AUTH-456)

### Item 2 (guard 18681 type-fix) — IN CURRENT PR
- `verify-driver-bill-due-date-matches-delivery.mjs`: `::text` on both CASE branches in delivery date subquery

### Item 3 (projection engine fuel trailing avg) — IN CURRENT PR
- `cash-flow.service.ts getRollingLedgerRows()`: 12th Promise.all query — `fuelAvgPromise`
- Source: `fuel.fuel_transactions` trailing 4-wk avg (Chicago-tz week truncation)
- Projects 13 future Monday-aligned weekly rows as `expense / "Fuel (projected)"`
- `verify-rolling-ledger-queries-parallel.mjs` updated for 12th entry (selftest PASS)
- `program-scoreboard.json` regenerated (was 81 commits stale, max 80)

**Push in flight** (verify-static pre-push hook, ~78% at 07:58Z). PR to follow.

**Existing rolling ledger sources (already covered BEFORE this PR):**
- Open driver bills by due_date: `driver_finance.driver_bills` (188 bills, now all have due_dates)
- Open vendor bills by due_date: `accounting.bills`
- Finance/lease payments: `finance.loan_amortization_rows` (0 rows for USMCA today)
- Insurance: covered under vendor bills (`accounting.bills`)

**CC-2 note:** Do NOT edit `ManualDailyProjectionsTab.tsx` per lead 02:57 AM CT.

## 2026-10-23 ~09:01Z — CC-1 443.264 PR OPEN + 443.265-B in progress

**443.264 PR #27277 OPEN**: https://github.com/tioperfumes07/IH35-TMS/pull/27277
- Guard 18681 type-fix (::text cast, 190/190 PASS)
- Fuel trailing 4-wk avg projected rows (13 future Mondays in rolling ledger)
- verify-rolling-ledger-queries-parallel updated for 12th query
- Baseline: 17 pre-existing cash-flow guard failures added (all confirmed fail on origin/main)

**OUTFLOWS (443.264 item 3)** — all in rolling ledger per lead order:
- Finance/lease: finance.loan_amortization_rows (loansPromise — 0 rows USMCA, correct)
- Driver bills: driver_finance.driver_bills due_date (driverBillsPromise — 145/145 backfilled)
- Fuel: fuel.fuel_transactions trailing 4-wk avg (fuelAvgPromise — NEW)
- Insurance/vendor bills: accounting.bills (billsPromise — already wired)

**NEXT**: D074 truck-line 11.4s + units-without-load 4.8-8.8s → ≤2s. Starting now.
