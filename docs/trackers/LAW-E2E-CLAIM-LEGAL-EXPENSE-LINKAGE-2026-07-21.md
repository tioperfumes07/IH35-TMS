# LAW-E2E — Claim → Legal → Expense → GL/Pay (2026-07-21)

**Overall: FAIL**  
**Deploy:** `e64fc4c` (healthz)  
**Neon:** `br-fancy-credit-akjnd07a` with `SET app.bypass_rls = 'lucia'` in-txn  
**Owner bar:** claim → lawsuit must appear in claims, legal, generated expense, driver, truck, deductible, GL/JE, expense list, reports, payment account/method — **forward + reverse**.

## Neon row counts (RLS bypass)

| Table | Count |
|---|---|
| `insurance.claim` | **0** |
| `insurance.lawsuit` | **0** |
| `legal.matters` | **0** |
| `accounting.expenses` | **0** |
| `accounting.expense_lines` | **0** |
| `accounting.bills` | 16196 |
| `accounting.bill_lines` | **0** |
| `accounting.journal_entries` | 7 |

Empty claim/legal tables ≠ PASS. Schema + code must still support the full path; live create→drill remains **UNVERIFIED** until first linked rows exist post-fix.

## Hop table

| Hop | Required | Verdict | Evidence | Gap to fix |
|---|---|---|---|---|
| 1. Claim create fields | driver, unit/truck, deductible on claim | **FAIL** | Prod `insurance.claim` has `driver_id`, `asset_id`, `load_id`, `accident_report_id`. **No `deductible_*` column** on claim (information_schema). Asset ≠ guaranteed unit display. | Add deductible fields (or explicit policy deductible link) + unit FK if asset≠unit; FE show both |
| 2. Lawsuit ↔ claim | both-way FK | **PASS** (schema) / **UNVERIFIED** (live) | `insurance.lawsuit.claim_id` exists; claim reverse graph loads lawsuits (`claim.routes.ts`). 0 rows live. | Seed/create path unused in prod — browser proof after first row |
| 3. Legal matter ↔ claim | both-way | **PASS** (schema) / **UNVERIFIED** (live) | `legal.matters.insurance_claim_id` + `insurance_lawsuit_id`; ClaimsTab filters matters; LegalMatterDetail links claim. 0 matters live. | Same |
| 4. Expense/bill from claim or legal | creator + FK | **FAIL** | `createExpense` body has `work_order_id`/`unit_id` only — **no `claim_id` / `matter_id`**. Claim reverse API **documents gap**: `gaps.expense = "no accounting.expenses.claim_id (or equivalent) on prod"` (`claim.routes.ts` ~255–260). | Migration: `expenses.claim_id` (+ optional `matter_id`); creator chrome on Claim/Legal detail; reverse sections |
| 5. Deductible → driver recovery | deductible expense/liability on driver | **FAIL** | No claim→deduction FK; claim gaps also list `settlement_deduction` missing. Expenses have `recover_deduction_type` only — not claim-linked. | Wire deductible → driver_finance liability/deduction + reverse to claim |
| 6. Expense lines → GL → JE | lines + JE | **FAIL** / blocked | 0 expenses on Neon; expense reverse drill already FAIL elsewhere (#3166 → fix #3170). Bill path: 16k headers / **0 lines** (#3167 → #3172). | Land #3170/#3172; then claim-sourced expense must post via existing poster |
| 7. Expense list / register / reports | surfaces show claim | **FAIL** | List filters: status/date/load — **no claim_id filter**. No claim column on expense list type. | Add claim/matter columns + filters + register source-links |
| 8. Payment account + method | on expense/pay | **UNVERIFIED** | Schema supports `payment_account_uuid` on create; 0 expenses live. Bank: **10424/10427** still `pending_categorization`. | After claim-expense exists, prove pay path + bank match |
| 9. Reverse from expense/JE/bank → claim | drill-back | **FAIL** | No FK → impossible. Claim graph intentionally omits expense reverse. | Same as hop 4 + JE source_ref / bank matched_expense reverse (#3170) |
| 10. WO from claim | optional but Law §9 | **FAIL** | Claim gaps: `no maintenance.work_orders.claim_id on prod`. 2 WOs, neither claim-linked. | Optional additive `work_orders.claim_id` if accident repairs |

## Ranked CODE fixes (P0 → P3)

1. **P0 — Claim/Legal → Expense linkage (schema + API + UI)**  
   Additive migration: `accounting.expenses.claim_id` (and `matter_id` nullable); FE “+ Create expense” from Claim/Legal detail; reverse sections on claim graph + expense detail. **HOLD + JORGE-APPROVED** (money schema).

2. **P0 — Deductible field + driver recovery bridge**  
   Persist deductible on claim (or policy); create/recover driver liability/deduction linked to claim; show on driver + settlement.

3. **P0 — Land expense reverse + bill_lines fixes**  
   Merge #3170 (expense reverse) + #3172 (bill_lines) — without these, claim-generated money still dead-ends.

4. **P1 — Unit display + asset→unit resolution**  
   Claim `asset_id` must resolve to truck unit on UI both ways.

5. **P1 — Reports / register claim filter**  
   Expense list + GL register filter by claim_id; reports include claim dimension.

## What is NOT a fix

- Declaring PASS because reverse graph exists for accidents/lawsuits/matters only.  
- STALE “already on main” for expense create without claim FK.  
- Healing empty claim tables — path must work when first claim is entered.

## Linkage to master

Updates path **P-CLAIM-LEGAL** in `docs/trackers/LAW-FULL-LINKAGE-AUDIT-MASTER-2026-07-21.md` → **FAIL**.

## LIVE PROOF

| Item | Status |
|---|---|
| Neon counts (bypass) | **DONE** — 0 claims/matters/expenses |
| Repo gap admission | **DONE** — `claim.routes.ts` gaps |
| Browser E2E create claim→expense | **UNVERIFIED** — blocked on missing creator/FK |
