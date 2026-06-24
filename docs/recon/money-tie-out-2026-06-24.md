# Money Tie-Out — Pass 5 (MONEY DISPLAY + POSTING INTEGRITY)

**Date:** 2026-06-24
**Scope:** Every surface that DISPLAYS a money total (dashboards, registers, aging, settlements, invoices, bills, P&L/BS/TB, banking, fuel, factoring, profitability) traced to its source query; every WRITE path that posts a journal entry / settlement line / ledger row traced for cents-integer math, balanced-by-construction, and rounding seams.
**Method:** frontend money render → backend route → SQL `FROM`/`SUM`; posting code read line-by-line; DB balance-trigger + GENERATED columns confirmed against `db/migrations/`.
**Constraint:** READ-ONLY recon. No code edits, no commits, no PRs, no posting executed, no flags flipped. `BILL_GL_POSTING_ENABLED` remaining OFF (CHAIN-03) is **by design** — not assessed as a bug. These are Tier-1 findings for Jorge; GUARD verifies read-only on Neon.
**Cross-ref:** builds on `data-source-map-2026-06-24.md` (Pass 3) and `stub-inventory-2026-06-24.md` (Pass 4 — the QBO-mirror count finding has a money-equivalent below, finding D-2).

**Legend** — ties? `yes` = displayed number derives from GL/subledger/source-of-truth; `at-risk` = recomputed/duplicated/non-authoritative source that can drift; `no` = displayed number cannot reconcile to the canonical ledger. Severity HIGH/MED/LOW.

---

## HEADLINE FINDINGS (2)

### H-1 — Banking "Manual JE" writes to an ORPHAN table the financials never read (POSTING + TIE-OUT, HIGH)
`POST /api/v1/banking/manual-je` (`apps/backend/src/banking/manual-je.routes.ts:80`) inserts lines into **`accounting.journal_entry_lines`** with **dollar** columns `dr_amount` / `cr_amount` (`z.number()`, numeric — NOT cents). Three independent problems compound here:

1. **Wrong table / invisible to the GL.** `journal_entry_lines` is referenced by **exactly one file in the entire repo** (this route) and has **no `CREATE TABLE` in `db/migrations/`** and **no reader**. Trial Balance, Balance Sheet and P&L all read **`accounting.journal_entry_postings`** (`trial-balance.service.ts:60`, `balance-sheet.service.ts:66`, `profit-loss.service.ts:66`). So a manual journal entry booked through Banking lands in a table the financial statements **never `SUM`** → the entry is recorded but **does not move the books**. A manual adjusting JE silently fails to affect TB/BS/P&L. Severity **HIGH** (tie-out: a posted-looking JE that doesn't post).
2. **No balance trigger on this path.** The DB constraint trigger `trg_check_journal_entry_balanced` is attached **only** to `accounting.journal_entry_postings` (`db/migrations/0092_…:73`, re-attached `202606080020_…:26`). `journal_entry_lines` has **no** balance enforcement.
3. **Float balance check.** The only guard is `Math.abs(totalDr - totalCr) > 0.0001` on **floating-point dollars** (`manual-je.routes.ts:60`). IEEE-754 dollar sums (`0.1+0.2`) plus a 0.0001 tolerance can accept an entry off by up to ~1/100 of a cent per stacking, and amounts are stored as dollars, not cents.

> Net: the canonical, cents-clean, trigger-protected posting engine (`posting-engine.service.ts`) is excellent (see P-1). This **second, parallel manual-JE path** bypasses all of it. This is the single most important money-integrity item in this pass.

### H-2 — Profitability revenue comes from `mdata.loads.rate_total_cents`, not the GL/invoices (TIE-OUT, HIGH)
Customer / Lane / Load profitability all source revenue from **`mdata.loads.rate_total_cents`** (the dispatch GROSS rate), never from `accounting.invoices` or the GL:
- `apps/backend/src/reports/customer-profitability.routes.ts:78`
- `apps/backend/src/reports/lane-profitability.service.ts:70`
- `apps/backend/src/dispatch/load-profitability.service.ts:84`

`rate_total_cents` is the **booked** rate and can legitimately diverge from the **invoiced/recognized** amount (customer credit, rate correction, partial bill, accessorial added at invoice time). So a load booked at $50,000 but invoiced at $45,000 shows $50,000 in profitability and $45,000 in P&L — two "revenue" numbers that don't tie. Cents are clean (bigint); the risk is **source authority**, not arithmetic. (Note: per CLAUDE.md these are management/operational reports, not the statutory GL — so this is a "label/expectation" risk, but it is the money-equivalent of the Pass-4 QBO-mirror-count drift: a real-looking total off a non-authoritative source.)

---

## TABLE 1 — MONEY DISPLAY SURFACES

| Money surface | Source-of-truth | ties? | cents-clean? | balanced? | FLAG + severity | file:line |
|---|---|---|---|---|---|---|
| Trial Balance | `accounting.journal_entry_postings` (GL) | **yes** | yes (`amount_cents` bigint) | n/a (read) | OK | `trial-balance.service.ts:60` |
| Balance Sheet | `accounting.journal_entry_postings` (GL) | **yes** | yes | n/a | OK | `balance-sheet.service.ts:66,125` |
| Profit & Loss | `accounting.journal_entry_postings` (GL) | **yes** | yes | n/a | OK | `profit-loss.service.ts:66` |
| AR Aging | `accounting.invoices.amount_open_cents` | **yes** | yes — `GENERATED ALWAYS AS (total_cents - amount_paid_cents) STORED`, cannot drift | n/a | OK | `ar-aging.service.ts:53`; col `0060_…:29` |
| AP Aging | `accounting.bills` (amount − paid) | **yes** | yes (bigint) | n/a | OK | `ap-aging.service.ts:79` |
| OwnerHome / Home weekly+today revenue | `accounting.invoices.total_cents` | **yes** | yes | n/a | OK | `home-widgets.routes.ts:40,160` |
| Home cash position / Banking KPIs | `banking.bank_accounts.current_balance_cents` | **yes** (source-of-truth balance col) | yes | n/a | OK | `home-widgets.routes.ts:246`; `banking.routes.ts:143` |
| Factoring balance | `factoring.company_balances` (reserve/advanced) | **yes** | yes (bigint) | n/a | OK | `home-widgets.routes.ts:283` |
| Vendor Balances | `accounting.vendor_balances` view → `accounting.bills` | **yes** | yes | n/a | OK | `bills.service.ts:230` |
| Settlement Summary (header) | `driver_finance.driver_settlements` net/gross | **yes** (header = SUM(lines) by construction) | yes | n/a | OK | `settlements.routes.ts:250` |
| Settlement Detail | `driver_finance.settlement_lines` | **yes** | yes | n/a | OK | `settlements.routes.ts:190` |
| **Customer Profitability** | should be `accounting.invoices`; **reads `mdata.loads.rate_total_cents`** | **at-risk** | yes | n/a | **NON-AUTHORITATIVE-REVENUE / HIGH** (H-2) | `customer-profitability.routes.ts:78` |
| **Lane Profitability** | same | **at-risk** | yes | n/a | **NON-AUTHORITATIVE-REVENUE / HIGH** | `lane-profitability.service.ts:70` |
| **Load Profitability** | same | **at-risk** | yes | n/a | **NON-AUTHORITATIVE-REVENUE / MED** (single-load drill, less aggregated) | `load-profitability.service.ts:84` |
| Fuel spend/savings | `fuel.fuel_transactions` | yes (operational, not GL — by design) | yes | n/a | OK (operational metric) | per Pass-3 map |
| **Accounting Hub KPI tiles** | backend lists, **re-summed in FE `.reduce()`** | **at-risk** (pagination) | yes | n/a | **FE-SUM-PAGINATION / MED** (D-1) | `AccountingHubPage.tsx:270-276` |
| **AR/AP Aging page totals** | backend already returns `totals`; **FE re-sums rows** | at-risk (shadow calc) | yes | n/a | **FE-SHADOW-SUM / MED** (D-1) | `ARAgingPage.tsx:48-51`, `APAgingPage.tsx:45-48` |
| **Bills page MTD / past-90 KPIs** | FE `.reduce()` over fetched rows | **at-risk** (pagination) | yes | n/a | **FE-SUM-PAGINATION / MED** | `BillsPage.tsx:131,135` |
| **Vendor Balances page total** | FE `.reduce()` (`totalOutstanding`) | at-risk (pagination) | yes | n/a | **FE-SUM-PAGINATION / MED** | `VendorBalancesPage.tsx:65` |
| **Factoring ReserveTracker / BatchWizard totals** | FE `.reduce()` over batches/invoices | at-risk (pagination) | yes | n/a | **FE-SUM-PAGINATION / LOW-MED** | `ReserveTracker.tsx:170,175`, `BatchWizard.tsx:52` |
| Bill Payments list total | FE `.reduce()` | at-risk (pagination) | yes | n/a | **FE-SUM-PAGINATION / LOW** | `BillPaymentsListPage.tsx:76` |

> **D-1 (FE money `.reduce()` cluster, MED):** several money KPIs are summed client-side over the *fetched* row page rather than displaying a backend grand-total. AR/AP aging is the clearest waste — the backend already computes and returns `totals` (`ar-aging.service.ts:110-128`, `ap-aging.service.ts:163-181`) yet the page re-derives them. The real **risk** is pagination/limit (`limit 500`): if a tenant ever exceeds the page size, the displayed "total open AP / AR / vendor outstanding" understates reality with no error. Today's volumes are small, so impact is latent, but it's a drift vector that CI won't catch.
>
> **D-2 (money-equivalent of the Pass-4 QBO-mirror-count finding):** Pass-4 found Lists-Hub tile counts read `accounting.qbo_remote_counts` (a QBO mirror) not live tables. The **money** analogue searched for in this pass — a P&L/BS/AR/AP dollar figure sourced from a `qbo_*` mirror table instead of the live ledger — was **NOT found**. All statutory money surfaces read the live `accounting.*` ledger/subledger. The closest analogue is H-2 (profitability off `mdata.loads`), which is operational, not the GL. **Good news: the money statements are not mirror-fed.**

---

## TABLE 2 — POSTING PATHS (write paths)

| Posting path | cents-clean? | balanced-by-construction? | rounding seam? | FLAG + severity | file:line |
|---|---|---|---|---|---|
| Posting engine (invoice/bill/expense/payments/advances) | **yes** — integer `amount_cents` end-to-end; dollar→cents only via `Math.round(x*100)` at ingest (`:553,:1005`) | **yes — code (`assertBalanced` `:348` requires dr>0,cr>0,dr==dr) AND DB trigger** on `journal_entry_postings` | none — credit line = `SUM(debit lines)` by construction (`:588,:714`) | **OK — reference-grade** | `posting-engine.service.ts:1113,348` |
| Void / reversal | **yes** — copies each original `amount_cents` exactly, flips dr/cr | **yes** — exact mirror of a balanced batch | none | OK | `posting-engine.service.ts:1289-1326`; `void.service.ts` |
| Customer/bill payment, cash/driver advance | yes | yes (2-line equal cr/dr) | none | OK | `posting-engine.service.ts:750,806,875,953` |
| Fuel posting | yes (`Math.round` to cents pre-insert) | yes (DB trigger) | none in posting | OK | `fuel-posting/poster.service.ts` |
| Factoring proportional allocation | yes | n/a (allocation, then posts via engine) | **seam — RECONCILED.** floor + largest-remainder, `remaining = total − assigned` distributes the exact `total`; no penny created/lost | OK (correctly handled) | `factoring-posting/poster.service.ts:23-46` |
| Factoring fees posting | yes | yes (createJournalEntry enforces dr==cr) | none | OK | `factoring-fees-posting/poster.service.ts` |
| Driver settlement engine split | yes (integer cents) | n/a (settlement lines, not JE) | **seam — RECONCILED** (`secondaryCents = total − primaryCents`, residual on secondary) | OK | `settlement-engine.ts:13-14` |
| Team split | yes | n/a (settlement lines) | **seam — RECONCILED** (`secondaryCents = total − primaryCents`, `:34`) | OK (sub-agent over-flagged; it self-balances) | `team-splits/apply.ts:31-35` |
| Auto-deductions | yes (integer cents) | n/a | none | OK | `auto-deductions/apply.ts` |
| Settlement deduction-cap proration | yes (`Math.round`/`Math.max` on cents) | n/a | **seam — RECONCILED** (`availableCents = grossCents − floorCents`; remainder absorbed into floor) | OK (low — no residual escapes; verify cap semantics if config edge cases arise) | `settlement-deduction-cap.service.ts:196` |
| Manual JE (core service) | yes (`amount_cents` bigint) | **yes — code guard dr==cr before insert** | none | OK | `journal-entries.service.ts` |
| **Banking Manual JE route** | **NO — float dollars (`dr_amount`/`cr_amount`)** | **NO — float-tolerance check only (`>0.0001`), no DB trigger** | float tolerance | **FLOAT-UNBALANCED + ORPHAN-TABLE / HIGH** (H-1) | `manual-je.routes.ts:58-60,80` |
| Maintenance two-section labor → bill/expense | line cents via `Math.round(x*100)` at copy (`:496`); header `totalCost` summed in **float dollars** then `.toFixed(2)` (`:144-149`) | header vs lines guarded by `trg_expense_total_matches_lines` **only at `posting_status='posted'`** (inert pre-Phase-2) | **seam — header/line float drift possible at create time**, caught later by the expense-total trigger at GL-post | **WO-HEADER-FLOAT / LOW-MED** | `two-section-service.ts:144-149,496` |
| Internal labor route | yes (`hourly_rate_cents` integer, parts summed in cents) | n/a (no JE in file) | none | OK | `internal-labor.routes.ts` |
| Bank-recon difference JE | yes (integer `variance_cents`) | yes (2-line balanced) | difference posts to a chosen account (intended write-off, not a lost penny) | OK | `bank-recon/match.service.ts:337-419` |

**DB enforcement confirmed:** `accounting.ensure_journal_entry_balanced()` (CONSTRAINT TRIGGER, `DEFERRABLE INITIALLY DEFERRED`, fires INSERT/UPDATE/DELETE) on **`accounting.journal_entry_postings`** — `0092_…:43,73`; re-attached `202606080020_…:26`; test `__tests__/double-entry-trigger.db.test.ts`. **Gap:** trigger covers only `journal_entry_postings`; the orphan `journal_entry_lines` (H-1) is unprotected.

**Correction to the parallel sub-agent sweep:** team-split, settlement-engine split, deduction-cap, and factoring allocation were initially tagged "SEAM-UNRECONCILED." Direct read shows each uses the `residual = total − sum(other parts)` (or largest-remainder) pattern, so **no penny is lost or created** — they are reconciled by construction. The genuinely unbalanced/unprotected path is H-1 (Banking Manual JE).

---

## TOP MONEY-INTEGRITY RISKS (ranked)

1. **H-1 — Banking Manual JE → orphan `accounting.journal_entry_lines`, float dollars, no trigger (HIGH).** A manual adjusting JE booked through Banking (a) doesn't appear in TB/BS/P&L (they read `journal_entry_postings`), (b) has no DB balance enforcement, (c) is balance-checked in float dollars with a 0.0001 tolerance. Either route it through the canonical posting engine / `journal_entry_postings`, or — at minimum — fail-loud + integer-cents balance + confirm GL reads it. *(Financial cluster — STOP for Jorge; do not self-fix.)* `manual-je.routes.ts:58-60,80`.
2. **H-2 — Profitability revenue off `mdata.loads.rate_total_cents`, not invoices/GL (HIGH).** Customer/Lane/Load profitability won't tie to P&L revenue whenever booked rate ≠ invoiced amount. Decide the contract: re-source from `accounting.invoices`, or label these explicitly as "booked-rate (operational)" so no one reconciles them to the GL. `customer-profitability.routes.ts:78`, `lane-profitability.service.ts:70`, `load-profitability.service.ts:84`.
3. **D-1 — Frontend `.reduce()` money KPIs over a paginated page (MED).** Accounting Hub, Bills, Vendor Balances, AR/AP aging totals, factoring trackers all sum the fetched row page client-side; at `limit 500` overflow the displayed grand-total silently understates. Backend already returns authoritative `totals` for AR/AP aging — use them; add grand-total fields elsewhere. Latent today (low volume), but no CI guard catches it. `AccountingHubPage.tsx:270`, `ARAgingPage.tsx:48`, `BillsPage.tsx:131`, `VendorBalancesPage.tsx:65`.
4. **Maintenance WO header `totalCost` float drift (LOW-MED).** Section A/B header total summed in float dollars + `.toFixed(2)` while lines convert to cents independently; header can disagree with `SUM(lines)` at create time. The `trg_expense_total_matches_lines` invariant catches it only at GL-post (`posting_status='posted'`), which is post-Phase-2 — so today the drift is uncaught at the WO surface. `two-section-service.ts:144-149`.
5. **Guard-coverage gap (LOW, process).** No CI guard asserts (a) money write paths use integer cents, (b) all JE writes target `journal_entry_postings` (not `journal_entry_lines`), or (c) FE money totals come from a backend grand-total rather than `.reduce()` over rows. H-1 and D-1 both survive green CI. A static guard on `journal_entry_lines` usage + a "no float money balance check" lint would lock H-1 from recurring once fixed.

**Reassurance (what ties cleanly):** the canonical posting engine is cents-clean, balanced by code AND DB trigger, with correctly-reconciled allocation/split math; TB/BS/P&L read the GL directly; AR aging rides a DB-`GENERATED` open-balance column; banking/factoring/home KPIs read source-of-truth balance columns; and **no statutory money surface is fed from a `qbo_*` mirror** (the money-equivalent of the Pass-4 count defect was searched for and not found).
