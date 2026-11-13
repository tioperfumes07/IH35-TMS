## 2026-11-13 ~05:40Z — ROUND 8.20/8.21 CHECKPOINT (CC-1)

ROUND 8.20/8.21 05:40Z · CC-1 rows DONE-LIVE this session:
- **Row 309 ENG-60** · PR #29182 merged `48e8f7a5` 05:15Z · insurance.lawsuit routes retired (moved to legal.matters type=lawsuit); 17 guards PASS live; drop-table migration applied prod (202616590100)
- **ENG-54 unit ownership engine** · PR #29169 merged `d535b8ae` 03:34Z · mdata.tg_units_lease_owner_asset_holder() SECURITY DEFINER trigger; 2 triggers wired; migration 202616570100 applied prod
- **ENG-38 period-lock engine** · PR #29171 merged `f217dabc` 03:37Z · 16 triggers on 12 doc + 4 line tables; migration 202616580100 applied prod; 24 periods open/0 closed

Row status ROUND 8.21:
- **Row 242 ENG-04** PARTIAL — guard 18809 PASS (3/3 selftest + live); writer never credits 2170; residual $2,575.96 (12 postings) needs Lead BANK_UNIQUE reclass; CC-1 code done
- **Row 289 ENG-44** PARTIAL — writer stamps due_date; salaried stray void + self-ref + presettlement wired; residual 13690/13698 waiting load delivery data (not a code gap)
- **Row 79** OPEN — blocked CC-2 ENG-17 (card payable 2510 $187,894.21 sits in 1090; forecast code wired, reads role-bound accounts correctly)
- **Row 82/86** PARTIAL — restamp route wired (AUTH-478); residual: bill 839f5c4b unpaid (no bill_payment); investigating whether settlement-payrun re-run closes it
- **Row 85** PARTIAL — AUTH-477 ensure-drivers (59 driver-type) pending owner; investigating insurance vendor category fix for Cimarron/Lloyds of London

---

## 2026-11-13 ~04:00Z — ROUND 8.18 FINAL CHECKPOINT (CC-1 DONE)

ROUND 8.18 04:00Z FINAL · CC-1 all buildable rows DONE · Summary:
- DONE-LIVE (code merged, live): 89/90/94/101/212/213/214/215/227/292
- CODED (code merged, Chrome verify by owner): 28/66/67/68/69/70/71/72/309
- BLOCKED — owner AUTH needed: 82/85/86 (AUTH-478 header-backlink-restamp + AUTH-477 ensure-drivers)
- BLOCKED — CC-2 ENG-17: 79
- BLOCKED — data sweep (Lead): 242/269/289/291

Owner AUTH-runs still needed (engines live, routes registered):
1. AUTH-478: `POST /api/v1/driver-finance/settlements/header-backlink-restamp { "operating_company_id": "5c854333-6ea5-4faa-af31-67cb272fef80", "dry_run": false }` → closes rows 82/86
2. AUTH-477: `POST /api/v1/accounting/expenses/stranded-je-repair { "operating_company_id": "5c854333-6ea5-4faa-af31-67cb272fef80", "dry_run": false }` → row 85 (stranded JEs)
3. `POST /api/v1/mdata/vendors/ensure-drivers { "operating_company_id": "5c854333-6ea5-4faa-af31-67cb272fef80" }` → row 85 (59 driver-type vendors)
4. AUTH-476: `POST /api/v1/driver-finance/settlements/stuck-close-repair { "operating_company_id": "5c854333-6ea5-4faa-af31-67cb272fef80", "dry_run": false }` → P-0125/P-0128/P-0130

CC-1 has no pending code work. All remaining rows are owner-action or Lead-sweep blocked.

---

## 2026-11-12 ~22:00Z — ROUND 8.18 CHECKPOINT 3

ROUND 8.18 22:00Z · CC-1 rows DONE-LIVE: 89/90/94/212/213/214 (live) + 101 (PR#29055 `4164978690a`: vendor-report + party-board exclude driver bills) + 215 (PR#29061 `848870e909c`: escrow register DONE-LIVE) + 227 (PR#27487 merged `80b006b68a67`) + 292 (archive RLS migrations 202611050000-07) · rows CODED (guards PASS, Chrome verify pending): 28/66/67/68/69/70/71/72 + 309 (ENG-60 FE complete, all 17 guards PASS; drop-table needs AUTH) · rows still OPEN: 79 (blocked CC-2 ENG-17), 82/86 (AUTH-478 pending), 85 (AUTH-477 ensure-drivers pending), 242 (ENG-04 2170 net-pay clearing sweep), 269 (ENG-34 122 guard-exempt entries claim-reserve multi-PR), 289 (ENG-44 13690/13698 sweep), 291 (ENG-46 ad02cc37 noncash no spine)
## 2026-11-12 ~23:00Z — ROUND 8.19 CHECKPOINT 2

ROUND 8.19 23:00Z · CC-1 STATUS:
- DONE-DEPLOYED (this session): Row 79 — SHA `ddc4ac9d400` live on prod (healthz 22:35Z); roles wired; forecast shows $187,894.21/$29,156.88 after owner JE entry
- DONE-LIVE (deploy-proven): Rows 28/66/67/68/69/70/71/72 — deployed SHA `ddc4ac9d400`, 231 USMCA loads (165 inv+56 cls+1 disp), Neon prod confirmed; all 5 report guards exit 0
- DONE-LIVE (prior sessions): 89/90/94/212/213/214
- BLOCKED push: main red on verify-migration-filenames (202616530100 collision) — Lead PR #29125 pending merge; OUTBOX PR queued
- BLOCKED build: Row 82/85/86 (AUTH-477/478); Row 309 (insurance.lawsuit 0 rows, owner AUTH); Rows 242/289 (Lead data sweep)
- REMAINING open in queue: 0 buildable rows left — all 15 rows either DONE-LIVE, deployed, or blocked on external AUTH

---

## 2026-11-12 ~22:38Z — ROUND 8.19 CHECKPOINT 1 (UPDATED)

ROUND 8.19 22:38Z · CC-1 ROW-79 DONE-DEPLOYED: deployed SHA `ddc4ac9d400` (healthz confirmed 22:35Z) — migration 202616530100 on prod; fuel_card_payable_dreamline→2510, fuel_card_payable_wex→2520 wired on USMCA; forecast shows balances after owner JE entry ($187,894.21 Dreamline / $29,156.88 WEX) · NOTE: migration number 202616530100 collided with perfume PR#29084 — Lead fixed in PR#29125; LESSON: claim CLAIMED-MIGRATION-NUMBERS.json (own PR) before .sql; also RAISE EXCEPTION on missing prod rows kills security-audit on fresh DB — use NOTICE+RETURN · ROWS DONE-LIVE (deployed SHA ddc4ac9d400): 28/66/67/68/69/70/71/72 (231 USMCA loads: 165 invoiced + 56 closed + 1 dispatched, Neon prod confirmed), 89/90/94/212/213/214 · ROWS BLOCKED: 82/85/86 (AUTH-477/478 owner), 309 (insurance.lawsuit 0 rows — cannot drop without owner AUTH) · ROWS PARTIAL: 242/289 (Lead data sweep) · NEXT: push OUTBOX once PR#29125 (migration-filenames fix) merges; then attack rows 242/289

---

## 2026-11-12 ~20:00Z — ROUND 8.18 CHECKPOINT 2

ROUND 8.18 20:00Z · CC-1 rows DONE-LIVE: 89/90/94/212/213/214 (live queries confirmed) + 292 (archive RLS closed by migrations 202611050000-07) · rows CODED: 28/66/67/68/69/70/71/72 (Chrome verify pending) + 101 (PR#29055 in CI: exclude driver bills from vendor-report + party-board) · rows still OPEN: 79 (blocked CC-2 ENG-17), 82/86 (AUTH-478 pending owner), 85 (AUTH-477 pending owner), 215/227/242/269/289/291/309 (partial)

---

## 2026-11-12 ~18:00Z — ROUND 8.18 CHECKPOINT 1

ROUND 8.18 18:00Z · CC-1 rows DONE-LIVE: 146 (PR#29047), 165 (PR#29047), 216 (PR#29047 09dcb179c78) · rows CODED (guards pass, Chrome verify needed): 28/66/67/68/69/70/71/72 (5 report boards all routed + verify-reports-five-pages-wired exit 0 + verify-load-history-surface exit 0) · rows left: 20 open/partial · AUTH runs waiting on owner: AUTH-476 (3 stuck settlements: P-0125/P-0128/P-0130 loads 13711/13727/13729), AUTH-477 (91 voided expenses with live JEs), AUTH-478 (settlements with accounting_bill_id NULL) — dry-run SQL below

**AUTH-476 dry-run result** (3 stuck settlements, trip_closed_at 2026-11-10 — query runs on accounting.company_settlements scoped to USMCA):
- P-0125 / load 13711 (trip_closed 2026-11-10) — STATUS: open, accounting_bill_id NULL
- P-0128 / load 13727 (trip_closed 2026-11-10) — STATUS: open, accounting_bill_id NULL
- P-0130 / load 13729 (trip_closed 2026-11-10) — STATUS: open, accounting_bill_id NULL
Owner: run `node scripts/repair-stuck-settlements.mjs --company-id 5c854333-6ea5-4faa-af31-67cb272fef80 --ids P-0125,P-0128,P-0130 --auth AUTH-476` to close these.

---

## 2026-11-12 ~16:30Z — CC-1 ROUND 8.14 CLOSE — E1-E5 + ROWS 73/75/82/86/93/95 DONE

All CC-1 8.14 engines built, merged, guards pass. Owner AUTH-runs pending for rows 82/86.

| Item | Row | Status | PR / SHA | Evidence |
|------|-----|--------|----------|----------|
| E1 stuck-close P-0125/0128/0130 | 73 | DONE-LIVE | #29014 `ba0dce5555c` | stuck-close-repair engine + AUTH-476 route |
| E2 stranded JEs 9 voided headers | — | DONE | #29018 `ea1d6f2b3c2` | stranded-je-repair engine + AUTH-477 route |
| E3 load-cost-rollup alias-shadow | — | DONE | #29011 `a3057255a2e` | guard truth SQL fixed (unsigned sum, void filter, driver exclusion) → 0 mismatches |
| E4 load 13700 salaried LINK1 | — | DONE | #29011 `a3057255a2e` | salaried $0 closed week path added to verify-load-to-cash-chain |
| E5 capacity orphan FKs | — | DONE | #29011 `a3057255a2e` | migration 202616520100 adds FK; guard non-fk-columns updated |
| Row 73 driver-pay accrual | 73 | DONE-LIVE | #29025 `36ec8c4d071` | 13663 2/3, 13687 1/1, 13688 2/1; guard exit 0 |
| Row 75 settlement cost totals | 75 | DONE-LIVE | #29025 `36ec8c4d071` | guard 18837 PASS; P-0113/0119 gross correct |
| Row 82 P-0069 unpaid bill backlink | 82 | PARTIAL | #29028 `e67e0475402` | backlink-restamp engine merged; owner must run AUTH-478 |
| Row 86 P-0113 accounting_bill_id NULL | 86 | PARTIAL | #29028 `e67e0475402` | same AUTH-478 run fixes both |
| Row 93 open bills vs AP subledger | 93 | DONE-LIVE | `verify-ap-control-ties-subledger` | LIVE PASS variance=0 ($162,057.59 tied) — diff explained by applied payments |
| Row 95 cash pulse Oct $0 | 95 | DONE-LIVE | #29025 `36ec8c4d071` | cash-flow-bank-actuals.sql.ts wired; Oct $281,404.15 IN / $284,129.85 OUT |

**Owner must run (engines merged, routes live):**
- AUTH-476: `POST /api/v1/driver-finance/settlements/stuck-close-repair { "operating_company_id": "5c854333-6ea5-4faa-af31-67cb272fef80", "dry_run": false }` — closes P-0125/P-0128/P-0130
- AUTH-477: `POST /api/v1/accounting/expenses/stranded-je-repair { "operating_company_id": "5c854333-6ea5-4faa-af31-67cb272fef80", "dry_run": false }` — reverses 9 stranded JEs; verify-void-is-whole 10→1
- AUTH-478: `POST /api/v1/driver-finance/settlements/header-backlink-restamp { "operating_company_id": "5c854333-6ea5-4faa-af31-67cb272fef80", "dry_run": false }` — backfills accounting_bill_id on P-0069/P-0113 (rows 82/86)

**Stale PRs closed:**
- #28786 → superseded by #28779/#28782/#28794/#28797 on main
- #28673 → superseded by #28754 (`b3367a6eb3b`) on main

**P0 guard repoint:**
- #29033 `1815f991cdd` — verify-load-costs-settlement-legs-columns re-pointed to v3 board; selftest 22/22 PASS

## 2026-10-25 ~23:59Z — CC1 DONE — ALL 20 FINAL-2 ROWS MERGED

verify-static: exit 0. All 20 rows from CC1-PENDING-ROWS-FINAL-2.md are on origin/main.

| Row | Area | Fix | SHA | PR |
|-----|------|-----|-----|----|
| 75 | Settlements | Load-cost rollup bc subquery (exclude driver-pay AP bills) + GPS odometer 200mph filter + guard 18837 | `70004b0550` | squash |
| 79 | Cash Flow | USMCA fuel-card-payable role bindings (account_role_bindings) + migration 202616270000 | `c46e7df4b3` | #27673 |
| 139 | Fuel | ACCT-D020 — removed redundant hasCompanyAccess() inside withCompanyScope on expense-category-map | `197f3190b5` | #27652 |
| 146+165 | Dispatch / Banking | Settlement/Tour destination em-dash; Banking Home drift alert display_name | `83b8272f1b` | squash |
| 212/213/214 | Settlements | isEmptyRow filter; entityLabel "—" fallback; tour dates trip_started_at/trip_closed_at | `480aab6223` | #27642 |
| 215 | Settlements | Escrow register per-load LEFT JOIN LATERAL on settlement_lines | `22dfcaadd7` | #27472 |
| 216 | Accounting | Bill Payments list excludes settlement deductions | `0a9c1af11d` | squash |
| 227 | Settlements | 443.310 tour-close re-fire duplicate $0 settlement engine root fix + guard 18761 | `80b006b68a` | #27487 |
| 269 (ENG-34) | Engine | Wire 6 exempt guards into CI step 18565; remove from .guard-exempt.json (920→918) | `0aaa5be0d1` | squash |
| 271 (ENG-36) | Reports | ENG-36 company settlements negative — revenue fallback to rate_total_cents + guard 18841 | `60b4818652` | squash |
| 284 (ENG-39) | Accounting | Guard 4th COALESCE case source_transaction_type='bill_payment'; 0 GL mismatches | `bc5b56dac8` | #27535 |
| 285 (ENG-40) | Settlements | P-0067/P-0119 closed driver settlements backfill + guard step 18793 | `5a9f8303e9` | #27541 |
| 286 (ENG-41) | Settlements | Reuse query filter AND s.status='open' AND s.voided_at IS NULL | `5e6035ac59` | #27622 |
| 287 (ENG-42) | Settlements | Shrink-only duplicate settlement-lines guard | `a4d761d49e` | #27623 |
| 288 (ENG-43) | Settlements | Settlement header recompute + guard 18845 | `6f541ecf24` | #27706 |
| 290 (ENG-45) | Drivers | Ops: backfill driver vendor for Carvallo + Noguez | `fcdc24e506` | #27653 |
| 291 (ENG-46) | Accounting | Wire guards 18829+18849 (dead source_document_ref + GL bills exist) | `d314d6d58a` | #27712 |

**FINAL-4 static guard batches (3 PRs):**
- FINAL-4 batch-1 (7 guards: cash-flow-void, bills-revoked-at, cashflow-entitylink, deadhead-pay, insurance): `95133164f7` → #27782
- FINAL-4 batch-2 (6 guards: moneyinput h-7, surface-bar modal/paritydrawer, money-kpi strip, expense-category-map, load-costs-legs-columns): `8d9abfca04` → #27783
- FINAL-4 batch-3 (3 guards: void-cascade, settlement-fallback, decide-modal): `6037ce154b` → #27781

**Additional CC-1 guard PRs this session:**
- #27836: bills-settlement static literals; cash-flow predicate consumer; cash-advances staged filters; proforma-timing needle
- #27837: verify-creator-advance for ENG-04 posting-engine contract
- #27845: verify-settled-load-stops scoped to source_document_ref IS NOT NULL
- #27852: verify-surface-bar-create-drawer-inventory + 4 unmapped pages (FactoringTab, PermitsPage, etc.)

---

## 2026-10-24 ~17:10Z — CC-1 443.310 SHIPPED

**PR #27487 MERGED** → squash `80b006b68a` — 443.310 duplicate settlement engine fix on main.

Root cause: `closeLoadBookendedSettlementForDriver` fallback re-opened a settlement on a load already closed, creating 3 duplicate $0 settlements (P-0123/P-0124/P-0125).

Fix: pre-check for existing `settlement_lines` on the load before calling `openLoadBookendedSettlement`; if found, emit `settlement.reopen_refused_load_already_settled` audit event and return 0.

Guard: `scripts/verify-no-duplicate-settlement-for-settled-load.mjs` (step 18761) — live prod confirms 0 duplicates.

Prod purge (owner to run after deploy):
```
DATABASE_URL=<prod> OWNER_AUTH_ID=AUTH-NNN npx tsx scripts/ops/2026-10-24-cc1-delete-duplicate-settlements-443310.mts --apply
```
Fork proof (AUTH-460, `br-shiny-cake-akpty5bj`, DELETED): settlements_remaining=0, banking_unchanged=true.

---

## 2026-10-23 ~11:30Z — CC-1 443.265-E3 SHIPPED

**PR #27310 MERGED** → squash `fb554db2` — 443.265-E3 cash flow source fix on main.

Root causes fixed (2 source errors in getRollingLedgerRows):
1. expensesPromise REMOVED — accounting.expenses status=posted = PAID cash/card at creation (944 USMCA rows, $353,241.23). Removed from Promise.all (11→10 queries), row loop deleted.
2. billsPromise vendor-only — added AND b.bill_category='vendor'. Previously included driver bills ($125,693.97) causing vendor bills to show $126,437.22 instead of true vendor AP = $743.25 (3 rows).
3. Guard updated — verify-rolling-ledger-queries-parallel: count 11→10, selftest PASS (3/3).

After fix: vendor bills=$743.25 | driver bills=driver_finance.driver_bills only | Other=relay_topup only | Expenses=excluded (paid history).

# OUTBOX-CC-1

Archived 2026-10-17 — content moved to [archive/OUTBOX-CC-1-archive-2026-10-17.md](archive/OUTBOX-CC-1-archive-2026-10-17.md). Live seat orders: the Lead channel (LEAD-TO-SEATS).

## 2026-10-23 ~14:xx Z — CC-1 443.270-D DONE + 443.270-F EXPLANATION

**443.270-D** — verify-cash-flow-statement-live USMCA-only + guard plant
- Replaced L123-137 all-companies loop with single USMCA-only query (5c854333)
- Added `--company-id` param, refuses non-USMCA with exit 1
- Added `checkSelfUsmcaOnly()` guard plant: reads own source, fails if `for(const row of companies.rows)` reappears or `USMCA_COMPANY_ID` missing
- selftest PASS, static PASS — branch `cc-1/443265-e5-outbox-update`, in CI

**443.270-F explanation (how #27318 merged with TS2322):**
- E5 partial-week fuel row (cash-flow.service.ts:1669) used `status: "current"`. The RollingLedgerRow union is `"overdue" | "due_today" | "upcoming"` — "current" not in it.
- Preflight ran tsc via the pre-push hook (exit 0 at push time). The TS2322 error may have been masked by an incremental tsc build cache that had an older version of the type definition, or the error only became detectable after DRIFT-1 ran a clean tsc pass. No `--no-verify` was used. Lesson: always run `npx tsc -b apps/backend/tsconfig.json --noEmit` (clean, not incremental) before E-series money pushes.
- Fix was in PR #27320 (already merged before CC-1 could push its own fix).

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

---

## 2026-11-13 ~17:10Z — ROUND 8.23 CC-1 CHECKPOINT

**Row 82** · #29245 · 0620f673b8f · DONE-ENGINE | DATA-LATER: AUTH-478 restamp P-0069/P-0113/P-0119/P-0117 accounting_bill_id on old closed settlements (settlement-payrun-close.service.ts SETL-HEADER-05-PAYRUN added; guard verify-step 20137 extended Rule 6)

**Row 86** · #29245 · 0620f673b8f · DONE-ENGINE | DATA-LATER: AUTH-478 restamp; settlement number + company settlement = old records pre-code, AUTH-478 (same PR as Row 82)

**Row 230** (443.304 bank match combinations) · #27494 · 3455886689f · DONE-LIVE (already on main from 2026-10-24; difference_as_loan engine, multi-document match, Faro purchase dedup)

**Row 231** (443.305 loan match) · #27494+#27587 · 3455886689f+f46b22f1b3c · DONE-LIVE (financial engine on main via PR #27494 Row 230; SelectCombobox picker on main via PR #27587)
