# LAW §9 E2E — Insurance claim → Legal → Expense linkage

**Date:** 2026-07-21  
**Scope:** Owner Law §9 full wiring bar — insurance claim → lawsuit/legal must appear in claims, legal, the expense it generates, driver, truck, deductible, GL/JE, expense list, reports, payment account, payment method — **forward AND reverse**. No dead ends.  
**Base:** `origin/main` @ `e64fc4c6b`  
**Worktree:** `/private/tmp/ih35-law-e2e-claim-legal-20260721-204821` (branch `docs/law-e2e-claim-legal-expense-2026-07-21`)  
**Neon:** project `tiny-field-89581227` · prod branch `br-fancy-credit-akjnd07a` · RLS bypass `set_config('app.bypass_rls','lucia',true)` in the **same transaction**  
**Constraints honored:** NEVER merge · NEVER Neon-apply · audit-first (no code fixes in this PR) · no STALE pile theater  

**Overall verdict:** **FAIL** — claim↔lawsuit↔legal matter schema/API links exist in part, but the money chain (claim/legal → expense/bill → GL/JE → payment → reports) is **not wired**. Deductible does not exist as a column. Create UIs omit driver / claim-link fields the API already accepts. Prod has **0** claims, lawsuits, matters, policies, and expenses (so live chain proof is schema/API only).

---

## Method

1. Repo trace: migrations, insurance/legal/accounting routes + FE create/detail surfaces.  
2. Neon introspection (RLS bypass): columns, FKs into/out of `insurance.claim` / `insurance.lawsuit` / `legal.matters`, row counts.  
3. Fail-honest: if a hop cannot be walked both directions with a real FK + UI/API surface, verdict is **FAIL** (or **UNVERIFIED** only when evidence could not be obtained).

**Live row counts (bypass, 2026-07-21):**  
`insurance.claim=0` · `insurance.lawsuit=0` · `legal.matters=0` · `insurance.policy=0` · `accounting.expenses=0`

---

## Hop table

| Hop | Required | Verdict | Evidence | Gap to fix |
|---|---|---|---|---|
| **1** Claim create → fields (driver, unit, deductible) | Create claim with driver + unit/truck + deductible persisted and shown | **FAIL** | **Unit:** PASS — `ClaimCreateModal` sets `asset_id`; API resolves via `resolveMdataAssetId`; list/graph expose `unit_id` via `mdata.assets` join (`claim.routes.ts` `claimSelectColumns`). **Driver:** schema+API PASS (`insurance.claim.driver_id` FK → `mdata.drivers`, create body accepts `driver_id`); **create UI FAIL** — `ClaimCreateModal` has no driver field. **Deductible:** **FAIL** — no `deductible*` column on `insurance.claim` or `insurance.policy` (Neon `information_schema`); create modal has none. ClaimsTab shows driver/unit columns when populated. | Add deductible (claim and/or policy) + UI; expose `driver_id` (and ideally `load_id` / `accident_report_id`) on `ClaimCreateModal`. |
| **2** Legal matter / lawsuit ↔ claim (both ways) | Lawsuit and legal matter link to claim; claim shows them; reverse from legal works | **FAIL** (partial schema PASS) | **`insurance.lawsuit.claim_id`:** PASS both ways — FK on prod; `LawsuitCreateModal` claim picker; `GET …/claims/:id/graph` returns lawsuits; ClaimsTab + LawsuitsTab reverse sections. **`legal.matters.insurance_claim_id` / `insurance_lawsuit_id`:** schema+FK+API PASS (`matters.service.ts` create/update/list filters). ClaimsTab / LawsuitsTab use `LegalMattersReverseSection`. Matter detail shows claim + driver + unit EntityLinks. **Create/edit UI FAIL** — `LegalMatterFormFields` / `formStateToCreatePayload` omit claim/lawsuit/driver/unit IDs (API-only). Detail page does **not** render `insurance_lawsuit_id`. Prod 0 linked rows. | Surface claim/lawsuit/driver/unit pickers on Legal matter create/edit; show lawsuit EntityLink on matter detail; optional “create matter from claim” CTA. |
| **3** Expense/bill generated from claim or legal | Creator produces expense or bill linked to claim/legal | **FAIL** | Claim graph API documents gap explicitly: `gaps.expense = "no accounting.expenses.claim_id (or equivalent) on prod"` (`claim.routes.ts` ~255–260; unit test asserts). Neon: `accounting.expenses` has `driver_uuid`, `unit_id`, `load_id`, `linked_work_order_uuid`, `payment_account_uuid`, `journal_entry_id` — **no** `claim_id` / `legal_matter_id` / `insurance_*`. `accounting.bills` has `source` / `source_system` / WO link — **no** claim/legal FK. No claim/legal → `createExpense` / `createBill` path under insurance or legal packages. **Note:** policy premium schedule → `createBill()` exists (`policy-bill-schedule.service.ts` + `insurance.payment_schedule.bill_uuid`) — that is **premium**, not claim/deductible/legal cost. | Migration: additive FKs on expenses (and/or bills) → claim + legal matter; claim/legal UI “+ Create expense/bill”; wire creator to set FKs + driver/unit from claim. |
| **4** Expense lines → GL; posting → JE | Lines hit GL accounts; post writes JE; reachable from claim | **FAIL** (generic expense infra PASS) | Generic path PASS in repo: `expense_lines.expense_account_uuid`; create/post in `expenses.routes.ts` sets `journal_entry_id`; DB test `expense-gl-posting.db.test.ts`. Neon columns confirm. **Claim chain FAIL** — no claim-sourced expense can exist without hop 3 FK/creator; cannot walk claim → expense → JE. Prod `accounting.expenses=0` so no live JE proof for this chain. | Depends on hop 3; then ensure post path always runs with category + payment account; reverse EntityLink expense ↔ JE ↔ claim. |
| **5** Expense list + account register + reports | Surfaces show claim-linked spend; reports include claim/legal financials | **FAIL** | Surfaces exist: `ExpensesListPage`, `AccountRegisterPage`, `TransactionRegisterPage`, Legal reports landing (settlement averages — not claim→expense drill). Reports module: **no** insurance-claim expense / deductible report grep hits. Expense list has no claim/legal filter or column. Cannot surface what is not linked. | Add claim/legal columns+filters on expense list; claim financial panel; report(s) for claim costs / reserves / deductible; register drill from JE back to claim. |
| **6** Payment account + payment method + bill payment / bank | Claim cost paid via payment account/method; bank/bill-payment reverse | **FAIL** (generic payment infra PASS) | Expenses carry `payment_account_uuid`; bill pay UI has methods (`PayBillModal`); payment-method catalog page exists. Bank linkage is generic accounting/banking — **not** claim-aware. No claim → bill payment / bank txn FK. Policy installment bills are unrelated to claim deductible. | After hop 3: require payment account on claim expenses; link bill payments / bank txns; reverse from bank/register → claim. |
| **7** Reverse from each surface → claim/legal/driver/unit | Driver, unit, expense, JE, legal, lawsuit all drill back | **FAIL** | **PASS fragments:** ClaimsTab graph reverse (lawsuits, matters, accidents, incidents, damage chains); EntityLink `claim` → `/safety/insurance/claims?claim_id=…`; lawsuit→claim EntityLink; matter→claim/driver/unit; DriverDetail lists **legal matters** by `related_driver_id`; VehicleProfile has legal-matters reverse + insurance policy summary. **FAIL:** DriverDetail has **no** insurance claims section (`driver_id` filter unused on driver page); VehicleProfile has **no** claims list; expense/JE/bank cannot reverse to claim (no FK); matter create cannot set links so reverse sections stay empty unless API-seeded; matter detail omits lawsuit link. | Driver + unit claim reverse panels; expense/JE EntityLinks to claim; legal form linkage (hop 2); money FKs (hop 3). |

---

## FK inventory (Neon prod, bypass)

**Into `insurance.claim`:**  
`insurance.lawsuit.claim_id` · `legal.matters.insurance_claim_id` · `safety.accident_reports.insurance_claim_id` · `safety.incidents.auto_created_claim_id` · (+ damage continuity column)

**Out of `insurance.claim`:**  
`policy_id` · `asset_id` → `mdata.assets` · `driver_id` → `mdata.drivers` · `load_id` → `mdata.loads` · `accident_report_id` → `safety.accident_reports`

**Into `insurance.lawsuit`:**  
`legal.matters.insurance_lawsuit_id`

**Out of `legal.matters`:**  
`insurance_claim_id` · `insurance_lawsuit_id` · `related_driver_id` · `unit_id` · `incident_id`

**Missing for §9 money bar:**  
any FK from `accounting.expenses` / `accounting.bills` / `accounting.bill_payments` / `banking.*` → claim or legal matter.

---

## Top 5 CODE fixes (ranked — do not implement in this PR)

| Rank | Fix | Why |
|---|---|---|
| **1** | Additive FKs + creator: `accounting.expenses` (and/or bills) → `insurance.claim` + `legal.matters`; claim/legal “+ Create expense/bill” that copies driver/unit and posts GL | Root §9 money gap; graph API already admits it; without this hops 3–6 cannot PASS. Financial cluster → owner Neon-apply + CPA path. |
| **2** | Deductible model: column(s) on claim and/or policy + UI + optional settlement/expense recovery link | Owner bar explicitly requires deductible; column absent on prod. |
| **3** | `ClaimCreateModal`: expose `driver_id` (+ `load_id` / `accident_report_id` already in API) | Schema/API ready; create UI is the dead end. |
| **4** | `LegalMatterFormFields` create/edit: pickers for `insurance_claim_id`, `insurance_lawsuit_id`, `related_driver_id`, `unit_id`; show lawsuit on detail | Schema/API ready; UI never writes links → reverse sections stay empty. |
| **5** | Reverse panels: DriverDetail + VehicleProfile list claims by `driver_id` / asset→unit; expense/JE EntityLink back to claim once FK exists | Closes dead ends from hub entities Jorge named. |

**Trivial one-liners deferred (not in this PR):** e.g. rendering `insurance_lawsuit_id` on matter detail — still prefer shipping with fix #4 so the field can be set.

---

## Acceptance bar (when a future CODE PR claims done)

Use `docs/templates/ACCEPTANCE-EVIDENCE-BLOCK.md`. Minimum live proof (RLS bypass):

1. Create claim with driver + unit + deductible.  
2. Create lawsuit linked to claim; create legal matter linked to claim **and** lawsuit via UI.  
3. Generate expense/bill from claim or matter; lines have GL accounts; post → JE.  
4. Expense appears on list + account register + a report with claim id.  
5. Payment account + method recorded; bill payment / bank reverse to expense → claim.  
6. From driver, unit, expense, JE, legal, lawsuit — one click back to claim.  

Until then: **UNVERIFIED / FAIL** — do not mark BUILT.

---

## Explicit non-claims

- Policy premium bill schedule ≠ claim deductible expense.  
- Empty prod tables ≠ “feature unused by choice”; they reinforce that the E2E path has never been exercised live.  
- Generic expense/JE/payment infrastructure PASS does **not** satisfy §9 for insurance/legal events.
