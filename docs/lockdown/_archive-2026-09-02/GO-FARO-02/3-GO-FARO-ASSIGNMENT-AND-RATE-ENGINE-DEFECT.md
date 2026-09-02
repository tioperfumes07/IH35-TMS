# GO — FARO CUSTOMER ASSIGNMENT + FACTORING RATE-ENGINE DEFECT
Owner request 2026-08-30: "ASSIGN ALL CUSTOMERS TO FARO FACTORING RIGHT NOW."
Author: Claude (read-only Neon; no writes performed). Every number below is verified, not estimated.

## 0. DISCRIMINATOR (proves the reads are real, not RLS-empty)
`SELECT count(*) FROM accounting.journal_entries` = **2214**. All reads below ran in the same
`run_sql_transaction` after `SET LOCAL app.bypass_rls = 'lucia'`. A read returning 0 without this
value present is a false-empty and must be discarded.

## 1. WHY THE ASSIGNMENT CANNOT BE PERFORMED YET — VERIFIED
| Fact | Value | Source |
|---|---|---|
| `factoring.customer_factor_assignment` rows, ALL companies | **0** | prod |
| `factoring.customer_factor_assignment` rows, USMCA | **0** | prod |
| `mdata.customers` for USMCA | 31 | prod |
| ...of those, real Faro debtors | **0** | name-matched against Faro schedule |
| `factoring.factor` USMCA row (Faro) | `40b3690b-f1d4-44b4-90cf-c1cfd4f79c33` | prod |
| Faro debtors on the August schedule | 26 (33 invoices, $95,075.00) | Faro export |

All 31 USMCA customers are coder test artifacts (`CC2-BATTERY-*`, `CC3 TEST *`, `CODEX-AUDIT-SPINE-*`,
`P23-SMOKE-*`, `TEST-CASCADE-*`, `ZZ-SAMPLE *`, `GUARD-TEST-*`, `TIO PERFUMES` code `TEST-TIO`, …).
Nearest name collision: existing `Semares Forwarding Services` vs Faro's
`S E Mares Forwarding Service LLC` — **do not merge these on name similarity**; create the Faro
debtor fresh and leave the test row for the void sweep.

**There is nothing to assign. The 26 debtors must be created first.** Load file:
`FARO-26-CUSTOMERS-TO-CREATE.csv` (name, factor_id, effective_from 2026-08-10, is_sample_data FALSE).

## 2. THE ASSIGNMENT TABLE IS THE ROOT OF THE WHOLE MODULE
`factor.service.ts:getFactorForCustomer()` resolves the factor **only** through
`factoring.customer_factor_assignment`. That table is empty, therefore:
- `createDraftBatch` → `resolvedFactorId = null` → every batch is written with `factor_id = NULL`
- submission queue → `expected_reserve_cents = null` on every invoice
- the `mixed_factors_not_allowed` guard is vacuous (one NULL bucket always passes)

The owner's instinct pointed at exactly the right table. Fixing customers unblocks all three.

### 2a. DEFECT — resolver ignores the void and active columns
`getFactorForCustomer` (factor.service.ts:227-234) filters only on tenant, customer and effective
dates. `customer_factor_assignment.voided_at`, `factor.voided_at` and `factor.active` are **not**
in the predicate. A voided assignment or a deactivated factor still resolves and still prices money.
Add `AND a.voided_at IS NULL AND f.voided_at IS NULL AND f.active IS TRUE`.

## 3. P0 DEFECT — THE FACTOR'S RATES ARE NEVER USED IN ANY CALCULATION
`batch.service.ts:178-179`
```ts
const advanceRate = deps.advanceRate ?? 0.95;
const feeRate     = deps.feeRate     ?? 0.025;
```
`deps.advanceRate` / `deps.feeRate` are **never passed by any non-test caller**. Both live call sites —
`batch.routes.ts:68` and `submission-queue.routes.ts:99` — call `createDraftBatch(..., { client })`.
The hardcoded defaults therefore fire on **every** batch USMCA will ever create.

`factoring.factor` for Faro holds advance 0.9700, fee 0.0150, reserve 0.0150. Those columns are
CRUD-only: written by the factor editor, read for display, and used in **zero** money math.

### Quantified against the real August schedule (face $95,075.00)
| | Code computes | Faro actual | Error |
|---|---|---|---|
| `expected_advance_cents` | $90,321.25 (95%) | $92,222.75 (97%) | **understated $1,901.50** |
| `expected_fee_cents` | $2,376.88 (2.5%) | $1,426.13 (1.5%) | **overstated $950.75** |

This is not a rounding issue. It is a silent-wrong-number path on the primary cash-in of the company.

### 3a. `reserve_rate` is not in the batch math at all
`calculateBatchTotals(invoices, advanceRate, feeRate)` has no reserve term. Faro is holding
**$1,426.13** of USMCA escrow reserve plus a **$5,000.00** cash reserve. Neither is recorded, so
USMCA's balance sheet omits $6,426.13 of assets receivable from the factor, and nothing tracks the
reserve release.

### 3b. Wire fees do not exist as a concept
$120.00 of wire fees across 12 of 33 invoices. No field, no posting, no reconciliation line.

### 3c. Rounding-basis divergence (1 of 33)
Code rounds `face × 0.97` once. Faro rounds escrow and discount separately, then subtracts.
FLS Transport inv 008, face $525.00: code $509.25, Faro $509.24. Divergence appears whenever
`face × 0.015` lands on a half-cent. Compute the same way Faro does — reserve and fee each rounded
to the cent, then subtracted — not as one 97% multiplication.

## 4. VERIFIED ARITHMETIC — the Faro statement closes to the cent
```
face 95,075.00 × 97%      =  92,222.75
  less wire fees             -120.00
  less cash reserve deposit -5,000.00
                            ---------
                             87,102.75
  less FLS 008 rounding         -0.01
                            =87,102.74  = statement "Payments to You"   ✓ EXACT

NFE: AR 95,075.00 - escrow 1,426.13 - cash rsv 5,000.00 = 88,648.87 = statement NFE   ✓ EXACT
escrow/face = 1.500000%   discount/face = 1.500000%   net(pre-wire)/face = 97.000000%
```
The factor row's stored rates are **right**. The engine simply never reads them.

## 5. SECOND, COMPETING SOURCE OF TRUTH (design defect — needs an owner decision)
`mdata.customers` carries `factoring_eligible`, `factoring_company_vendor_id`,
`factoring_advance_rate_override`, `factoring_reserve_pct_override`, `factoring_recourse_type`.
Today 9 USMCA customers have `factoring_eligible = true` and 1 (`P44-LISTS-RW-20260811`) has a
`factoring_company_vendor_id` — all test rows, none reachable by `getFactorForCustomer`.
Two mechanisms can answer "which factor prices this invoice" and they can disagree.
McLeod/NetSuite precedent: the effective-dated assignment table is the system of record; the
customer-level fields are eligibility flags and negotiated overrides layered **on top of** it,
never a parallel assignment. Recommend that ordering and a guard that refuses to price an invoice
whose two sources disagree.

## 6. ORDER OF WORK — do not reorder
1. **Cursor** — fix `batch.service.ts` to resolve advance/fee/reserve from the effective-dated
   factor row; remove the 0.95/0.025 defaults entirely (a missing factor must **throw**, never
   silently price). Add the reserve and wire-fee terms. Match Faro's rounding basis.
2. **Cursor** — add void/active predicates to `getFactorForCustomer` (§2a).
3. **CC-1** — create the 26 debtors from `FARO-26-CUSTOMERS-TO-CREATE.csv`, `is_sample_data FALSE`.
4. **CC-1** — insert 26 rows into `factoring.customer_factor_assignment`, factor
   `40b3690b-f1d4-44b4-90cf-c1cfd4f79c33`, `effective_from 2026-08-10`, `effective_to NULL`.
5. **CC-2** — load the 33 invoices from `FARO-33-INVOICES-TO-CREATE.csv`, then prove invoice 007
   (ITS Logistics, $350.00) computes escrow $5.25 / discount $5.25 / net $339.50 through the app,
   and invoice 008 (FLS, $525.00) computes net $509.24 **not** $509.25.
6. **CC-2** — re-run the batch against all 33 and assert `expected_advance_cents = 9222275`,
   `expected_fee_cents = 142613`, reserve `142613`. Only then may `prod_verified` be written.

## 7. ACCOUNTING QUESTION THAT OUTRANKS THE CODE — OWNER DECISION REQUIRED
The Faro facility is `Faro Factoring Full Recourse V1`, `recourse_days 95`. Under ASC 860 a
**full-recourse** arrangement normally fails the sale-of-receivable test and is accounted for as a
**secured borrowing**, not a sale:
- AR **stays on** USMCA's books at $95,075.00 (not derecognized)
- Liability "Due to factor" $88,648.87 (the NFE)
- Assets: escrow reserve receivable $1,426.13 + cash reserve $5,000.00
- $1,426.13 discount fee = interest/financing expense; $120.00 wire fees = bank charges

If the system instead derecognizes AR on factoring (sale treatment), USMCA's balance sheet is wrong
in both directions and the $88,648.87 obligation to Faro is invisible. **Do not code either
treatment until the owner rules.** The Faro agreement's recourse language decides it.

## 8. NOT DONE BY ME, AND WHY
No writes were performed. Neon MCP here is read-only by design and this is a financial mutation to
production; it belongs in the app through a coder seat with an audit trail, not in a console.
