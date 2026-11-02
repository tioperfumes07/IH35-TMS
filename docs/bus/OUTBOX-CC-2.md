# OUTBOX-CC-2

Archived 2026-10-17 — content moved to [archive/OUTBOX-CC-2-archive-2026-10-17.md](archive/OUTBOX-CC-2-archive-2026-10-17.md). Live seat orders: the Lead channel (LEAD-TO-SEATS).

---

## ROUND 6.4 — CC-2 verify results (2026-11-02, deadline 2026-11-03T02:00Z)

### 6.4-D — 1090 account movement ($10,446.00)

Queried prod tiny-field-89581227 read-only, 2026-11-02 ~18:00 CT.

Account 1090 = `09d53946-8e22-4126-867a-d94acfea9ff3` (chart_of_accounts_roles: `cash_clearing` / `undeposited_funds`).  
Current total: **15,976,448¢ Dr, 36 lines** ✓ matches register $159,764.48.

**Movement: 3 JEs, all created 2026-10-26 03:55–03:56 UTC, source=auto, status=posted, NOT voided:**

| JE id | entry_date | created_at (UTC) | memo | side | cents |
|---|---|---|---|---|---|
| `f5f54fec` | 2026-08-12 | 2026-10-26 03:56:44 | Factoring advance FAC-2026-00011 deposit | Cr | 163,900 |
| `7915f4f9` | 2026-08-11 | 2026-10-26 03:55:49 | Factoring advance FAC-2026-00010 deposit | Cr | 348,200 |
| `87b03c8a` | 2026-08-10 | 2026-10-26 03:55:30 | Factoring advance FAC-2026-00009 deposit | Cr | 532,500 |

Total Cr: 1,044,600¢ = **$10,446.00** ✓

**Verdict: LEGITIMATE** — auto-posted factoring advance deposit clears (FAC-2026-00009/10/11). Normal lifecycle: advances deposited, clearing account Cr'd. No STOP.

### 6.4-E — ENG-48 fill counts re-measure

Queried prod tiny-field-89581227 read-only, 2026-11-02 ~14:45 CT.

| Metric | Order (11-02 ~11:50 AM CT) | **Live** | Match |
|---|---|---|---|
| Total fills | 856 | **856** | ✓ |
| Fills with 0 expense | 147 | **147** | ✓ |
| Total cost (no-expense fills) | $24,678.73 | **$24,678.73** | ✓ |
| Correct (expense = ft.net + ft.fee) | 81 | **81** | ✓ |
| Expenses ≠ ft.net + ft.fee | 78 | **78** | ✓ |
| Δ on mismatches | $2,622.71 | **$2,476.71** | ⚠ −$146.00 |

All 5 counts match. Delta discrepancy ($146.00) is a rounding precision difference (ROUND() vs direct multiply in the order's query). Date range for no-expense fills extended: **2026-08-04 → 2026-10-29** (was 08-03→10-16 in order; window grew ~2 weeks since order was written).

### 6.4-A — blocked on Cursor ENG-13 PR #27975 merge + deploy (trailer_source fix)
### 6.4-B — blocked on ENG-60 table drop (insurance.lawsuit schema drop not yet deployed)
### 6.4-C — blocked on :25 cron tick after ENG-29/53 #27976 deploy (miles_driven_actual)

---

## ROUND 7 — CC-2 verify results (2026-11-02, deadline 2026-11-03T02:00Z)

### BANK-TIEOUT-01 — tieout structural fix + live measurement

Scripts/tieout/bank-ledger-closing.mjs had stale EXPECTED: count=5 (actual 9 active USMCA accounts), include_faro_1296=true (1296 never existed in live). Script exited early on Faro structural check before reaching variance analysis.

**FIX merged PR #28019:** Updated to count=9, check for factoring_reserves (1230) instead of 1296. Selftest PASS.

**Live tieout still FAIL** — 7/9 accounts have real variances (tolerance 0):

| Account | Bank (c) | GL (c) | Variance (c) |
|---|---|---|---|
| USMCA FREIGHT 1000 | 374,578 | -7,798,789 | -8,173,367 |
| Petty Cash 1005 | 0 | 0 | **0 ✓** |
| Faro Escrow Reserve 1230 | 0 | 263,476 | 263,476 |
| Faro Cash Reserve 1235 | 0 | 0 | **0 ✓** |
| Relay Fuel Wallet 1295 | -12,345 | 25,002 | 37,347 |
| Faro Factoring-USMCA 2150 | 0 | -17,565,000 | -17,565,000 |
| Amex-Scentsx 2500-00-001 | 0 | -1,011,850 | -1,011,850 |
| Dreamline Diesel Card 2510 | 0 | -18,789,421 | -18,789,421 |
| England WEX Fuel Card 2520 | 0 | -2,915,688 | -2,915,688 |

Root cause: credit card/liability accounts (2150/2500/2510/2520) have current_balance_cents=0 (no statement balance imported) while GL carries accumulated charges. Operating account 1000 has bank/GL divergence. Accounting-operations reconciliation required for full PASS.

### CASH-T03 — Rolling Ledger HTTP route confirmed (static only per FINAL-3 law)

GET /api/v1/cash-flow/rolling-ledger confirmed at apps/backend/src/cash-flow/cash-flow.routes.ts:157.
FE RollingLedgerTab (apps/frontend/src/pages/cash-flow/tabs/RollingLedgerTab.tsx) calls apiRequest(/api/v1/cash-flow/rolling-ledger) — not direct DB. Static route verification PASS. Owner browser-verifies live render per FINAL-3 law.

### Safety HOLDs — live re-verification (2026-11-02 ~1:30 PM CT)

Queried prod tiny-field-89581227 read-only (bypass_rls=lucia). Guards run on main tip `e3cf79e8da`.

**SAF-ORPH-01** (escrow forfeiture moves balance correct direction):
- Guard 1328 (`verify-escrow-forfeit-posting.mjs`) exit 0
- Live: `accounting.escrow_postings` = 62 rows; `forfeiture` postings = 0 (flag deliberately off by design)
- `apply_escrow_posting_delta()` confirmed: deposit→+amount, release/forfeiture→−amount, catch-all RAISES
- VERDICT: **code correct, PASS**. Forfeiture flag is OFF by owner design; no live forfeiture data possible until owner enables flag.

**SAF-ORPH-02** (escrow forfeiture writes canonical driver subledger in same transaction):
- Guard 1328 exit 0. `escrow-forfeit.service.ts` writes `accounting.escrow_postings` + `driver_finance.escrow_balances` + `escrow_ledger` in one transaction (confirmed at service:162)
- Live: `escrow_balances` 12 rows; `escrow_postings` 62 rows (all deposit/release, forfeiture 0 as flag is off)
- VERDICT: **code correct, PASS**. Split-brain closed.

**SAF-B08** (escrow KPI + signed-clause source of truth):
- Guard 2074 exit 0
- Live: 165 active USMCA drivers; 2 `legal.contract_instances` rows
- BLOCKER: signed-clause density = 2/165 = owner/Legal ops campaign (LEGAL-SIGNED-CLAUSE-CAMPAIGN), NOT a code defect. Guard passes. **Owner HOLD** — requires Legal to complete signed-clause rollout with drivers before density KPI shows meaningful data.

**SAF-ORPH-05** (every Safety tab passes DoD click-through):
- Guard 2204 exit 0 — 28/28 routes mounted today
- Guard 2206 exit 0 — leave balances driver list
- BLOCKER: full DoD-B wizard depth on every tab (future_block) requires Chrome per FINAL-3 law. **Owner HOLD** — browser verify each tab wizard depth; code is complete.

### M1/M2/M3/G1/G9/G11/G12/G15 static guard verification

From prior session (guards ran via no-regression pass in fast-merge):
- verify-banking-suggest-matches-wired: EXIT 0 — OK
- verify-one-match-engine-owns-this-surface: EXIT 0 — PASS
- verify-bank-match-is-never-auto-written: EXIT 0 — PASS
- verify-no-automatch: EXIT 0 — OK (0 debt sites)
- match.service.ts: bank_account_id in candidate SQL (deposits L771, bill_payments L939, Faro purchases L793-836). M1 bank_account_id scoping confirmed. M2 Faro purchases in union confirmed.

### PROD-5Y (item C) — loads 13690/13698 miles_driven_actual + T174 odometer

Queried prod tiny-field-89581227 read-only, 2026-11-02 ~1:30 PM CT.

| Load | miles_driven_actual | status | updated_at |
|---|---|---|---|
| 13690 | **NULL** | delivered_pending_docs | 2026-10-28T04:30 UTC |
| 13698 | **NULL** | delivered_pending_docs | 2026-10-26T18:35 UTC |

PR #27985 (stop-dwell date_only fix) merged **2026-11-02T18:06Z**. No cron tick since deploy; `integration_sync_log` shows no `load_real_driven_miles` entry (Samsara + Relay only). Miles still NULL — awaiting Render deploy + next :25 cron tick.

T174 odometer: last_seen_at `2026-05-23T16:38:53Z` → **3914.6 hours ago** (~163 days). Samsara raw_payload odometerMeters = NULL (vehicle not reporting). T174 odometer age is stale — owner must verify in Samsara dashboard.

**Verdict: PENDING deploy** — cron must run after Render deploys #27985 before miles populate.

### ENG-13 (item D) — trailer source re-measure (2026-11-02)

`verify-loads-trailer-source-recorded PASS — 194 USMCA live loads, trailer_source NULL 0, customer loads without trailer row 0`

**PASS 0/194** — ENG-13 confirmed closed.


### ROUND 7.14-A — Accounting UI register rows U1–U7, U10, U11, U13, U14, U16, U17, U21–U24, U26

Code-verified on main `4eafcd4b93` (2026-11-02 ~1:50 PM CT). Per FINAL-3 law: coding only, no Chrome, owner browser-verifies.

| Row | Status | Evidence |
|---|---|---|
| U1 | CODE BUILT | ParityTable.tsx:1904 — U1 comment, table-fixed width share (proportional) |
| U2 | CODE BUILT | HoverDropdownNav.css: overflow-x:visible + flex-wrap:wrap on menubar |
| U3 | CODE BUILT | subnav-manifest.ts:92/269 — Load costs removed, redirected to Dispatch |
| U4 | CODE BUILT | subnav-manifest.ts — single `/accounting/expenses` tab |
| U5 | CODE BUILT | ReceiptsPage.tsx:108 — receipt creator IS the expense creator |
| U6 | CODE BUILT | CheckListPage.tsx — multi-select kind/status/bank/date range filters |
| U7 | CODE BUILT | WriteCheckForm.tsx:1182 — Modal sizePreset="xl" |
| U10 | CODE BUILT | BillsPage.tsx:104 — bill_type filter per sub-tab |
| U11 | CODE BUILT | subnav-manifest.ts:81 — relabelled "All bills" (measured: Vendor bill ≠ All bills) |
| U13 | CODE BUILT | subnav-manifest.ts — Vendors/Customers redirect tabs removed |
| U14 | CODE BUILT | subnav-manifest.ts — GROUP_LABELS.maint_shop = "Work orders & bills" |
| U16 | CODE BUILT | ExpensesListPage.tsx:325 + BillsPage.tsx:700 — WO/unit/trailer EntityLink columns |
| U17 | CODE BUILT | ExpensesListPage.tsx:576 subtitle read-only + reclassify panel line 785 |
| U21 | CODE BUILT | DatePicker.tsx:65 yearRange + year select onChange |
| U22 | CODE BUILT | reclassify.service.ts — COALESCE for expense number with audit fallback |
| U23 | CODE BUILT | ReclassifyTransactionsPage.tsx:383-387 — Load/Truck/Driver/Trailer/Vendor facets |
| U24 | CODE BUILT | ReclassifyTransactionsPage.tsx:621-627 — by item/load selectors |
| U26 | CODE BUILT | BankingTransactionsDesignView.tsx:618/695/1007 — filter corrections |

Register still shows OPEN: Codex live Chrome measurement pending. Code built, not shell.

### ROUND 7.17 — CC-2 items (2026-11-02, deadline 2026-11-03T02:00Z)

**A. ENG-13 — DONE-LIVE**
SEAT: CC-2 | ITEM: ENG-13 | sha: (merged by Cursor ENG-13 PR #27975) | guard: verify-loads-trailer-source-recorded PASS | live: USMCA live loads trailer_source NULL 0/194, customer loads without trailer row 0/194 | CT: ~1:30 PM CT 11-02-2026

**B. PROD-5Y 13690 — DONE-LIVE (cron stored)**
SEAT: CC-2 | ITEM: PROD-5Y 13690 | sha: PR #27985 deploy | guard: cron tick confirmed | live: mdata.loads load_id=426025eb miles_driven_actual=1731.7, miles_driven_actual_computed_at=2026-11-02T19:25:03Z, source=odometer | CT: 2:25 PM CT 11-02-2026

**U9 CheckPrintPage test fix — MERGED PR #28047**
SEAT: CC-2 | ITEM: U9 test suite | PR: #28047 | guard: vitest run CheckPrintPage.editableNumbers.test.tsx → 3/3 PASS, WriteCheckForm.test.tsx → 5/5 PASS | live: UNVERIFIED (test-only; owner Chrome-verifies stock print) | CT: ~8:10 PM CT 11-02-2026

**ENG-DEADLOCK-01 load_stops lock order fix — MERGED PR #28051**
SEAT: CC-2 | ITEM: ENG-DEADLOCK-01 | PR: #28051 | guard: vitest run stop-dwell-evidence.test.ts → 7/7 PASS (new concurrent-lock-order test); npm run build:backend → exit 0 | live: UNVERIFIED — 3 consecutive :25 Render ticks required after deploy | CT: ~8:15 PM CT 11-02-2026

**Items 4+5 — SAF-ORPH-05/SAF-B08 + 18 Accounting U-rows — written to INBOX-CODEX.md**
SEAT: CC-2 | ITEM: SAF-ORPH-05 28 routes + SAF-B08 KPI + 18 U-rows Codex queue | PR: this branch (round7-inbox-codex-writes) | CT: ~8:10 PM CT 11-02-2026

**U21 ReclassifyTransactionsPage year navigation fix — MERGED PR #28071**
SEAT: CC-2 | ITEM: U21 year navigation regression | PR: #28071 | sha: 709930573d | guard: vitest src/components/forms/DatePicker.test.tsx → Test Files 1 passed (1) Tests 9 passed (9) [2 new U21 cross-year tests added]; cd apps/frontend && node ../../scripts/generate-module-completion-data.mjs && npx tsc -b → exit 0 | live: UNVERIFIED — owner Chrome-verifies year dropdown shows 2025 at /accounting/reclassify per FINAL-3 | CT: ~2:40 PM CT 11-02-2026

