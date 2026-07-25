# DESIGN HOLD — CPA Step 3 CORRECTED: CoA role designation + accessorial/TONU additions

**Status:** DESIGN-ONLY · **DOCS-ONLY PR** · **BUILD-AND-HOLD** · **DO NOT MERGE** · no migration, no seed, no Neon write, no flag flip.
**Branch:** `design/cpa-step3-coa-role-map-hold`
**CPA posture:** reuse the existing poster · **no new GL math** · flags stay as-is · no writes to Neon/prod.

Binds to: `docs/specs/QUALITY-STANDARD-LOCKED.md`, `docs/specs/ARCHITECTURE-BLUEPRINT-2026-07-05.md` (§4, §5, §6), skills `ih35-accounting-decisions`, `ih35-financial-migrations`, `ih35-tms-standards`. Rule 07 (never delete/rename — only ADD; archive duplicates). Rule 13 (financial cluster — owner-gated). Rule 16 (fix root cause, no patch).

Standards match: QuickBooks / NetSuite **control-account** pattern (post by a designated role → account; the **system never guesses** a GL account) + McLeod/Alvys accessorial breakout (Detention / Layover / Lumper / TONU / Other). GAAP: ASC 606 (line-haul + accessorial revenue), ASC 860 (factoring = secured borrowing; reserve = receivable-from-factor, NOT cash).

---

## 0. ⛔ WITHDRAWN premise (audit trail — do NOT repeat)

A first pass (this same branch, local only) authored a migration that **widened `catalogs.account_role_bindings.role_key`** on the premise that `account_role_bindings` (0 rows) was the CoA role registry to seed. **That premise is WRONG and the migration was ABANDONED — never pushed, never merged, discarded via `git reset --hard origin/main`.** Independent live verification (Neon + repo) established:

- **`catalogs.account_role_bindings` is the LEGACY fallback**, not the primary. The resolver (`apps/backend/src/accounting/coa-roles/resolver.service.ts`) hits **`accounting.chart_of_accounts_roles` FIRST** (~L126, L224) and only falls back to `account_role_bindings` (~L150–168, L267) for a few legacy single bindings. **`accounting.chart_of_accounts_roles` = 28 rows / 16 roles is the PRIMARY registry.**
- **Seeding / widening the legacy table = a split-brain patch. FORBIDDEN.** All role designation goes into **`accounting.chart_of_accounts_roles`** only.

No `account_role_bindings` seed or CHECK-widen is proposed anywhere in this corrected design.

---

## 1. Verified state (Neon + repo — trusted)

| Fact | Evidence |
|---|---|
| PRIMARY role registry = `accounting.chart_of_accounts_roles` (28 rows / 16 roles); LEGACY fallback = `catalogs.account_role_bindings` (0 rows) | `resolver.service.ts` L126/224 primary, L155/267 legacy fallback |
| Resolver is **fail-closed / no-guess**: unmapped role → `"Designate the control account in accounting.chart_of_accounts_roles (role='…')."` | `resolver.service.ts` L103 |
| **CoA-roles API routes are NEVER registered** in `apps/backend/src/index.ts` → `CoaRolesPage.tsx` points at a **dead** endpoint (`block-35-chart-of-accounts-roles` SHELL) — that is why roles aren't fully designated | route plugin `apps/backend/src/accounting/coa-roles/coa-roles.routes.ts` exists (GET/upsert `/api/v1/accounting/coa-roles`) but is **not** mounted in `index.ts` |
| MISSING on the primary table: **revenue roles, settlement roles, `reimbursement_expense`**. Factoring / AR / AP / lease roles **exist** | `chart_of_accounts_roles` current 16 roles |
| Factoring CoA has **13+ near-duplicate reserve accounts with wrong subtypes** (CashOnHand / Savings / etc.) | live CoA — archive-never-delete; owner ruling required |
| **No TONU account**; accessorial only **combined** ("Accessorial / Detention Income") | live CoA |
| Carrier revenue = **TRANSP + USMCA**; **TRK EXCLUDED** (lessor `42000-LEASE`) | skill §9; `202607620000` precedent |
| `weekly-close.routes.ts` hardcodes `deductions_total = 0`, `reimbursements_total = 0`, `net_pay = grossPay` (net = gross) — **mounted in `index.ts`, no FE caller yet** | `apps/backend/src/driver-finance/weekly-close.routes.ts` ~L90–110 |
| Unwired guards present but not in the verify chain: `scripts/verify-samsara-stats-types.mjs`, `scripts/verify-factoring-posting-uses-resolver-and-roles.mjs` | files exist; not referenced by `verify-steps/*` |

---

## 2. CORRECTED sequence (design only — each step is a SEPARATE future PR; this PR ships none of them)

### (a) Register the CoA-roles API routes — **non-financial wire** (separate future PR)
Root cause of "roles aren't fully designated": the designation surface has no backend. Fix (no financial content):
- **Mount** the existing plugin in `apps/backend/src/index.ts`: register `apps/backend/src/accounting/coa-roles/coa-roles.routes.ts` (default `fastify-plugin` `accounting.registerCoaRolesRoutes`, wrapping `registerCoaRolesRoutes` from `apps/backend/src/accounting/coa-roles/routes.ts`). It exposes `GET /api/v1/accounting/coa-roles` + an upsert (`role`, `account_id`, `is_active`), entity-scoped via `withCompanyScope`.
- Frontend already wired: `apps/frontend/src/pages/accounting/CoaRolesPage.tsx` + `apps/frontend/src/api/accounting.ts` call `/api/v1/accounting/coa-roles` (currently dead — block-35 SHELL). No FE change needed beyond confirming the endpoint responds.
- This is a route-mount only (no GL math, no migration) → ships as its own **non-financial** PR, not this design HOLD.

### (b) Owner **designates** the missing roles INTO `accounting.chart_of_accounts_roles` — never `account_role_bindings`
Once (a) is live, the **owner** (Owner/Admin, via the CoA-roles surface) maps each missing role → a control account. The **system never guesses** (QBO/NetSuite control-account pattern; resolver stays fail-closed). Missing roles to designate:
- **Revenue:** `line_haul`, `fuel_surcharge`, accessorial `detention` / `layover` / `lumper` / `tonu` / `other`.
- **Settlement:** the settlement/driver-pay roles the settlement build needs (per skill §4 / blueprint §3) — enumerate at build time.
- **`reimbursement_expense`.**
- Prerequisite (future owner-gated **financial** migration — **design only here, NOT authored in this PR**): widen `accounting.chart_of_accounts_roles.role` CHECK **and** the resolver `COA_ROLE_VALUES` enum to include the new role keys as a TRUE SUPERSET (additive; never narrow). Then the owner designates the account per entity. Entity scope: TRANSP + USMCA for revenue; TRK excluded. Per-entity via `uq_coa_roles_company_role_active` — no cross-entity binding.

### (c) Additive TONU + accessorial children (owner-applied accounts; **no migration in this PR**)
Additively (Rule 07 — never rename/delete existing "Accessorial / Detention Income" or the messy legacy rows):
- ADD **"Sales of Service"** (Income, non-postable parent) for TRANSP + USMCA.
- Re-parent (relocate, keep active) existing "Freight / Line-haul Income" + "Fuel Surcharge Income" under it.
- ADD **"Accessorial Revenue"** (Income, non-postable parent) + children **Detention / Layover / Lumper / TONU / Other Accessorials** (postable). TONU is the net-new account — no TONU account exists today.
- **Archive-and-relocate (void-not-delete, keep reachable)** the combined "Accessorial / Detention Income" and messy legacy Layover/Lumper rows under "Accessorial Revenue" (`deactivated_at` + re-parent). Owner identifies exact rows against live CoA — never a blind UPDATE.
- These accounts are **owner-applied on Neon** (the account seeds are financial-cluster; the owner picks account_numbers against the live per-entity CoA to avoid `uq_accounts_company_account_number` collisions). Then designated to their roles via (b).

### (d) Subtype normalization + duplicate-reserve archival — **GATED on Jorge's reserve-subtype ruling**
- 13+ near-duplicate factoring **reserve** accounts carry wrong subtypes (CashOnHand / Savings / etc.). Under ASC 860 the reserve is a **receivable-from-factor (Other Current Asset)**, not cash/savings.
- **BLOCKED:** owner must rule on the canonical reserve subtype **before** any balance-sheet move. On ruling: normalize the subtype on the ONE canonical reserve account and **archive** (deactivate, never delete) the duplicates, relocating them so history stays reachable. No DELETE, no rename. Owner-applied on Neon.

---

## 3. Also documented (future-conflict hygiene — no code change in this PR)

- **`weekly-close.routes.ts` net=gross hardcode:** the settlement insert hardcodes `deductions_total = 0`, `reimbursements_total = 0`, `net_pay = grossPay`. It is mounted in `index.ts` but has **no FE caller** yet. Flagged now as a **cheap future-conflict fix** — when the settlement deduction/reimbursement applier lands (blueprint §3, "wire the orphaned deduction applier"), this route must compute real `deductions_total` / `net_pay`, not zeros. Left as-is here (no FE caller = no live harm), documented so it isn't silently shipped as "done".
- **Unwired guards** (present, not in the `verify-steps/*` chain): `scripts/verify-samsara-stats-types.mjs` and `scripts/verify-factoring-posting-uses-resolver-and-roles.mjs`. The latter is directly relevant — it asserts the factoring poster resolves accounts **via the role resolver** (not by name). Recommend wiring both as verify-steps in a follow-up (Rule 17: verify-steps only) once (a)/(b) land, so "post by designated role" can't regress.

---

## 4. Linkage / why TONU matters (ASC 606 + cancellation AR-leak)

Posting stays role-resolved (control-account pattern). Forward + reverse, on live data:

| account/role (designated in chart_of_accounts_roles) | customer/vendor | GL posting | load/dispatch | audit | reverse drill |
|---|---|---|---|---|---|
| Line-haul / Fuel Surcharge / Accessorial children (`line_haul`, `fuel_surcharge`, `accessorial_*`) | customer (bill-to) | Cr income @ delivery (two-event latch: DR Unbilled Rev / CR income; then DR A/R / CR Unbilled Rev) | `mdata.loads` | invoice/JE `audit.row_changes` | invoice → load → income account → JE legs |
| **TONU** (`tonu`) | customer | Cr TONU income when a **cancelled** load is billed Truck-Ordered-Not-Used | `mdata.loads` (cancelled) + canonical `dispatch.cancellation_reasons` | cancellation event + invoice JE | cancellation → TONU invoice → TONU income → A/R |

**Cancellation AR-leak (flow3):** with no TONU account/role, a cancellation-TONU bill has no designated credit account → it either fails fail-closed or posts to the wrong combined account, leaving a receivable without a clean matching income credit. Adding the TONU account (c) + designating the `tonu` role (b) closes the leak and gives McLeod/Alvys-grade accessorial reporting.

---

## 5. Acceptance[] (resolves on live evidence AFTER the future PRs — UNVERIFIED here; this PR is docs-only)

1. `GET /api/v1/accounting/coa-roles` responds (routes mounted in `index.ts`); `CoaRolesPage.tsx` lists/edits designations. **(future PR (a); UNVERIFIED)**
2. `accounting.chart_of_accounts_roles.role` CHECK + `COA_ROLE_VALUES` are a TRUE SUPERSET incl. revenue/settlement/`reimbursement_expense`; owner has designated each new role → account per entity (TRANSP+USMCA; TRK excluded); **no `account_role_bindings` seed**. **(future owner-gated migration + designation; UNVERIFIED)**
3. "Sales of Service" + "Accessorial Revenue" parents (non-postable) + Detention/Layover/Lumper/**TONU**/Other children exist for TRANSP+USMCA; line-haul/fuel-surcharge re-parented; combined + legacy Layover/Lumper archived (deactivated) + relocated; **zero DELETEs**; history reverse-drillable. **(owner-applied; UNVERIFIED)**
4. Cancellation-TONU bill credits the designated `tonu` role account; A/R balanced; no leaked receivable. **(owner-applied + poster wiring; UNVERIFIED)**
5. Reserve subtype normalized to the Jorge-ruled value (receivable-from-factor) on the canonical account; duplicates archived (never deleted). **(GATED on owner ruling; UNVERIFIED)**
6. `verify-factoring-posting-uses-resolver-and-roles` (and `verify-samsara-stats-types`) wired as verify-steps and green. **(future PR; UNVERIFIED)**

---

## 6. Explicit statements

- **This PR ships DOCS ONLY.** No migration, no `account_role_bindings` seed or CHECK-widen, no account/role seed, no `canonical_factor_agreements` write, no flag flip, no Neon/prod write.
- All role designation targets **`accounting.chart_of_accounts_roles`** (primary), **never** `catalogs.account_role_bindings` (legacy fallback).
- The **system never guesses** a control account — the owner designates through the CoA-roles surface; the resolver stays fail-closed.
- Reserve subtype + duplicate-reserve archival are **GATED on Jorge's ruling** before any balance-sheet move.
- **DO NOT MERGE without `JORGE-APPROVED`.** Financial cluster — no self-merge; owner applies any future migration/seed on Neon.
