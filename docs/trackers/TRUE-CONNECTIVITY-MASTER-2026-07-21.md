# TRUE CONNECTIVITY MASTER — Living Ledger (2026-07-21)

**Branch:** `docs/true-connectivity-master-20260721`  
**Nature:** Permanent **scoreboard** — not a WAVE verify, not STALE theater. Cursor continues **FAIL → code**; coder merges wiring PRs.  
**Law:** `docs/specs/ARCHITECTURE-BLUEPRINT-2026-07-05.md` §9 (forward + reverse; money + ops + audit).  
**Method:** Prove **LIVE mounts** + **FK/API hops** + **reverse UI**. PASS only with evidence. Else **FAIL** or **UNVERIFIED**.  
**Deploy baseline:** `GET https://api.ih35dispatch.com/api/v1/healthz/shallow` → `version=e64fc4c` (confirmed 2026-07-21).  
**Neon:** project `tiny-field-89581227` · branch `br-fancy-credit-akjnd07a` · READ-ONLY; RLS bypass `set_config('app.bypass_rls','lucia',true)` in-txn.  
**Related register:** path audits in open PRs **#3166–#3178** · prior master `LAW-FULL-LINKAGE-AUDIT-MASTER-2026-07-21.md` (#3173 / #3177).

> **How to use this file:** Update status cells when a CODE PR lands + live proof exists. Do not flip FAIL→PASS on merge alone. Do not delete paths — only add evidence rows.

---

## Pending context (piles snapshot)

From `docs/trackers/block-audit-piles-2026-07-21.json`: pending ≈ **GAP 291 + NEEDS-OWNER 106 + NEEDS-PROD 24 + UNVERIFIED 10 ≈ 431** (BUILT 721). This ledger is the **connectivity spine** across those piles — not a substitute for per-block trackers.

---

## A. Economic paths (Law §9)

Link each path to its FAIL-honest audit PR + open fix PR (if any) + **one-line next CODE action**.

| Path | Status | Audit PR / file | Open fix PR | Next CODE action (one line) |
|---|---|---|---|---|
| **Expense** | **FAIL** | [#3166](https://github.com/tioperfumes07/IH35-TMS/pull/3166) · `LAW-E2E-EXPENSE-LINKAGE-2026-07-21.md` | [#3170](https://github.com/tioperfumes07/IH35-TMS/pull/3170) | Ship expense detail + `GET /expenses/:id` + wire JE `source-links` + register `sourceRoute` keep `expense_id`. |
| **Bill** | **FAIL** | [#3167](https://github.com/tioperfumes07/IH35-TMS/pull/3167) · `LAW-E2E-BILL-BILLPAYMENT-LINKAGE-2026-07-21.md` | [#3172](https://github.com/tioperfumes07/IH35-TMS/pull/3172) | Persist `bill_lines` on vendor Bill create; prove Neon lines > 0 + bill-sourced JE. |
| **Settle** | **FAIL** | [#3168](https://github.com/tioperfumes07/IH35-TMS/pull/3168) · `LAW-E2E-SETTLEMENT-PAYRUN-LINKAGE-2026-07-21.md` | [#3149](https://github.com/tioperfumes07/IH35-TMS/pull/3149) HOLD · [#3171](https://github.com/tioperfumes07/IH35-TMS/pull/3171) FE | Pay-run close must call `resolveRoleAccount` (primary CoA), not empty `catalogs.account_role_bindings`; wire FE preview/close. |
| **Claim-Legal** | **FAIL** | [#3175](https://github.com/tioperfumes07/IH35-TMS/pull/3175) · `LAW-E2E-CLAIM-LEGAL-EXPENSE-LINKAGE-2026-07-21.md` (#3174 closed dup) | *none yet* | Additive `expenses`/`bills` FKs → claim + legal matter + create-from-claim UI; deductible column; ClaimCreateModal `driver_id`. |
| **Invoice** | **FAIL** | [#3177](https://github.com/tioperfumes07/IH35-TMS/pull/3177) · `LAW-E2E-INVOICE-AR-LINKAGE-2026-07-21.md` | *none yet* | Require income account + `source_load_id` on create; JE EntityLink; kill $0.01 fixture-only path as “done.” |
| **Factor** | **FAIL** | [#3177](https://github.com/tioperfumes07/IH35-TMS/pull/3177) · `LAW-E2E-FACTORING-LINKAGE-2026-07-21.md` | *none yet* | Prove one live advance batch → liability/reserve JE (roles exist; **0** live advances/batches). |
| **Fuel** | **FAIL** | [#3177](https://github.com/tioperfumes07/IH35-TMS/pull/3177) · `LAW-E2E-FUEL-LINKAGE-2026-07-21.md` | [#3178](https://github.com/tioperfumes07/IH35-TMS/pull/3178) HOLD maps | Owner designate fuel CoA maps → flush poster so `posted_to_gl` > 0 (1499 rows, 0 fuel JE). |
| **Maint** | **FAIL** | [#3176](https://github.com/tioperfumes07/IH35-TMS/pull/3176) · `LAW-E2E-MAINTENANCE-WO-BILL-LINKAGE-2026-07-21.md` | *none yet* | Auto WO→bill/expense must stamp `unit_id`; live linked bills/expenses = 0. |
| **Safety-fine** | **FAIL** | [#3176](https://github.com/tioperfumes07/IH35-TMS/pull/3176) · `LAW-E2E-SAFETY-FINE-LIABILITY-LINKAGE-2026-07-21.md` | *none yet* | Define GL model (company-paid expense JE + driver recovery via settlement JE with fine provenance). |
| **Bank** | **FAIL** | [#3177](https://github.com/tioperfumes07/IH35-TMS/pull/3177) · `LAW-E2E-BANK-MATCH-LINKAGE-2026-07-21.md` | *none yet* | Account Register + JE reverse to bank txn; clear for-review backlog with match/categorize provenance. |
| **Escrow** | **FAIL** | [#3176](https://github.com/tioperfumes07/IH35-TMS/pull/3176) · `LAW-E2E-ESCROW-DRIVER-LINKAGE-2026-07-21.md` | *none yet* | Provision per-driver `accounting.escrow_accounts` bridges; designate `escrow_liability_default` + `cash_clearing`. |
| **Advance** | **FAIL** | [#3176](https://github.com/tioperfumes07/IH35-TMS/pull/3176) · `LAW-E2E-CASH-ADVANCE-RECOVERY-LINKAGE-2026-07-21.md` | *(same as Settle #3149)* | Designate `advance_recovery` + fix pay-run resolver; live advances = 0. |

### Economic scoreboard (honest)

| PASS | FAIL | UNVERIFIED |
|---:|---:|---:|
| **0** | **12** | **0** (paths audited; live E2E proofs still pending after CODE) |

Master path register sibling: [#3173](https://github.com/tioperfumes07/IH35-TMS/pull/3173) / updated in [#3177](https://github.com/tioperfumes07/IH35-TMS/pull/3177). Guard companion: [#3169](https://github.com/tioperfumes07/IH35-TMS/pull/3169) `verify-no-dead-schema`.

---

## B. Ops cross-module matrix (required hops)

Directed hops that **MUST** exist under Law §9 / architectural design. Defect classes:

`MISSING_LINK` · `DUAL_PATH_OLD_ACTIVE` · `ORPHAN_NEW` · `UNMOUNTED_ROUTE` · `WRONG_CANONICAL_TABLE` · `UI_ONLY`

### B.1 Core operational chain (Dispatch spine)

| Hop | REQUIRED | CODE evidence | LIVE evidence | Defect class |
|---|---|---|---|---|
| Dispatch load → driver | Yes — assign primary/secondary | `apps/backend/src/dispatch/quick-assign.service.ts:9–55` (`driver_id` → `assigned_primary_driver_id`); BOL join `bol-generator.service.ts:121` | **UNVERIFIED** live assign on prod UI this pass; schema/API wired | — (repo PASS; live UNVERIFIED) |
| Dispatch load → unit | Yes | `quick-assign.service.ts:10,55–73` (`unit_id` → `assigned_unit_id`); OOS hard block `:95–110` | **UNVERIFIED** live | — |
| Driver → HOS clocks | Yes — WF-038 | `telematics/hos-clocks.service.ts:203–212` `getCurrentClocks`; assign reads `views.drivers_with_hos_status` `quick-assign.service.ts:14–32`; FE `/safety/hos` `manifest.tsx:1490` | HOS routes mounted; **UNVERIFIED** clock freshness vs Samsara pull | — |
| Unit OOS / DVIR major → block assign | Yes — WF-050 / maint advisory WF-044 | OOS hard_block `quick-assign.service.ts:95–110`; PM-due advisory `:65–73`; DVIR→WO `maintenance/pre-flight-dvir.routes.ts:15,206–214` | **UNVERIFIED** planted OOS assign attempt | — |
| WO (if OOS/defect) → unit + driver + load | Yes | `pre-flight-dvir.routes.ts:170–214` inserts WO with `unit_id`, `driver_id`, `load_id` | Neon WO linked money = **0** (batch3 audit); demo WOs vendor null | `MISSING_LINK` (money) |
| Safety DVIR / incident → claim | Yes when loss | `insurance.claim` FKs from accident/incident (claim-legal audit); `insurance/claim.routes.ts` graph | Neon `insurance.claim=0` | `MISSING_LINK` (live empty) + UI gaps |
| Claim → lawsuit → legal matter | Yes | `insurance.lawsuit.claim_id` FK; `legal.matters.insurance_claim_id` / `insurance_lawsuit_id` (API PASS) | Neon claims/lawsuits/matters = **0**; Legal create UI **omits** pickers | `UI_ONLY` + `MISSING_LINK` |
| Claim/legal → expense/bill → JE | Yes — §9 money | **ABSENT** — no `claim_id`/`legal_matter_id` on `accounting.expenses`/`bills` (graph API documents gap ~claim.routes.ts:255–260) | expenses=0; no claim-sourced JE | `MISSING_LINK` |
| Expense/bill → JE → Account Register reverse | Yes | Expense create/post wired; JE `source-links` API exists; **FE source-links callers = 0**; register expense route drops id (#3166) | Posted expense JE **UNVERIFIED**/empty | `ORPHAN_NEW` (API without FE) · `MISSING_LINK` (reverse) |

### B.2 Module ↔ module hop list (matrix form)

Rows = from · cols = to. Cell = REQUIRED hop summary + defect if known.

| From → To | Dispatch | HOS/ELD | Maintenance | Safety | Insurance | Legal | Drivers | Fleet/Units | Banking | Accounting/CoA | Settlements | Factoring | Fuel | Documents |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Dispatch** | — | assign reads HOS view | PM/OOS gates; DVIR can open WO | load on fines/incidents optional | load_id on claim API | load via claim | assigned drivers | assigned unit | — | load on expense/invoice | loads on settlement | packet from load | fuel may attr load | load docs packet |
| **HOS/ELD** | hard_block on assign | clocks svc + `/safety/hos` | — | violations tabs | — | — | driver HOS page `/drivers/:id/hos` | — | — | — | — | — | — | — |
| **Maintenance** | WO can carry `load_id` | — | WO unit FK | DVIR bridge | warranty claims separate | — | WO driver_id | unit_id required | — | WO→bill/expense FKs exist; **live 0**; auto omits unit_id | cost may hit settlement later | — | — | WO attachments |
| **Safety** | related_load on fines | hos-violations | DVIR↔maint | fines/incidents | auto_created_claim_id | matter.incident_id | subject_driver | unit on fine | bank pay link on fine **sans GL** | **no fine→expense/JE** | convert→liability→deduction | — | — | driver docs |
| **Insurance** | claim.load_id | — | — | accident↔claim | claim/lawsuit | lawsuit→matter | claim.driver_id (**create UI ABSENT**) | asset→unit | — | **no claim→expense FK** | — | — | — | COI docs |
| **Legal** | — | — | — | incident_id | claim/lawsuit FKs | matters | related_driver_id (**create UI ABSENT**) | unit_id | — | **no matter→expense** | — | — | — | matter docs |
| **Drivers** | assignment | clocks | WO driver | fines/DQ | claims reverse **ABSENT** on DriverDetail | matters reverse PASS | hub | unit assignment | escrow tile | driver on expense | settlements/advances | — | fuel driver attr | DQ docs |
| **Fleet/Units** | assignment | — | WO/PM | DVIR/OOS | policy_unit + claims reverse **ABSENT** | unit matters | assigned drivers | hub | — | unit on bill/expense | — | — | fuel unit | unit docs |
| **Banking** | — | — | — | fine bank link | — | — | Driver Escrow tile | — | DesignView live; Workflow-B **@archived** | categorize→GL (3/10427); reverse FAIL | settlement forms archived→DesignView | factoring forms archived | — | bank attachments |
| **Accounting/CoA** | — | — | WO financial reverse UI PASS | — | premium bills ≠ claim cost | — | — | — | register↔bank reverse FAIL | roles + accounts (see §D) | pay-run uses **legacy bindings=0** | factor roles designated | fuel maps **missing** | — |
| **Settlements** | loads bookended | — | — | fine recovery | — | — | driver settlement | — | pay path | JE via pay-run (**UNBOUND** roles) | hub | — | fuel deduct | settlement PDF |
| **Factoring** | load→invoice assemble | — | — | — | — | — | — | — | advance forms archived | factor CoA roles ON; **0 advances** | — | hub | — | packets |
| **Fuel** | load attr weak | — | — | — | — | — | driver attr weak | unit attr | — | flush dead; maps HOLD #3178 | fuel deduct | — | hub | — |
| **Documents** | `/documents` + `/docs` | — | — | driver docs routes | COI | — | DQ | unit | — | — | — | packets | — | DocsHome mounted |

**Legend for cells with known defects (expand in audits):**

| Defect hotspot | Class | Evidence |
|---|---|---|
| Claim/legal → money | `MISSING_LINK` | No expense/bill FK; #3175 |
| Pay-run CoA | `DUAL_PATH_OLD_ACTIVE` + UNBOUND | `settlement-payrun-close.service.ts:121–140` reads **only** `catalogs.account_role_bindings` (Neon **0**); primary resolver is `accounting/coa-roles/resolver.service.ts:334` → `accounting.chart_of_accounts_roles` |
| Banking Workflow-B forms still in tree | `DUAL_PATH_OLD_ACTIVE` (mitigated) | Files `@archived` + guard `verify-banking-workflow-b-archived.mjs`; live mount is `BankingTransactionsDesignView` (`BankingHome.tsx:516`, `BankAccountDetail.tsx:166`) |
| JE source-links API | `ORPHAN_NEW` | Backend GET exists; FE callers **ABSENT** (#3166) |
| SafetyHome v5 shell | `DUAL_PATH_OLD_ACTIVE` | `SafetyHome.tsx:2` `@deprecated` sunset 2026-09-01; canonical `/safety/*` tabs |
| DispatchList | `DUAL_PATH_OLD_ACTIVE` | `DispatchList.tsx:1` `@archived` → DispatchBoard |
| Escrow bridges | `MISSING_LINK` | `accounting.escrow_accounts` = **0** (batch3) |
| Fuel GL | `MISSING_LINK` | posted_to_gl=0; maps undesignated (#3178) |

### B.3 Documents

| Hop | REQUIRED | CODE | LIVE | Defect |
|---|---|---|---|---|
| Documents module reachable | Yes | `manifest.tsx:943` `/documents`, `:951` `/docs` → `DocsHomePage` | Mount exists; content depth **UNVERIFIED** this pass | — |
| Cross-entity doc reverse (load/driver/WO/claim) | Yes §9 | Partial per-module attachments; no single matrix proof | **UNVERIFIED** | Treat gaps as `MISSING_LINK` until hop-proven |

---

## C. Dual-path / stale-active (owner language)

### Definition

**`DUAL_PATH_OLD_ACTIVE`** = *new design written but old format still shows* (or old route/service still reachable and preferred by operators).

Not the same as:

| Class | Meaning |
|---|---|
| `ORPHAN_NEW` | New API/table/UI built but **unmounted / unwired** — never reaches operators |
| `UNMOUNTED_ROUTE` | Route file exists; not in `manifest` / autoload / `index.ts` |
| `WRONG_CANONICAL_TABLE` | Writes RETIRE schema (`mdata.qbo_*`, `bank.*`, etc.) instead of canonical |
| `UI_ONLY` | Screen exists; no FK/API persistence |
| `MISSING_LINK` | Required hop absent in schema **or** live |

### Detection method (repeatable)

1. **Router import graph** — `apps/frontend/src/routes/manifest.tsx` (and subnav): which page component is actually `<Route element=…>`?
2. **`@deprecated` / `@archived` markers** — ripgrep `apps/frontend/src` for those tags; confirm archived files are **not** imported by live routes.
3. **Duplicate page files** — same domain, two implementations (e.g. `BankTxCategorizationPage` vs `BankingTransactionsDesignView`); prefer the one mounted + guarded.
4. **Backend dual resolvers** — e.g. pay-run `resolveRoleBindingAccount` (legacy bindings) vs `resolveRoleAccount` (primary `chart_of_accounts_roles`). If production callers use the empty legacy path while the new path is designated elsewhere → **DUAL_PATH_OLD_ACTIVE** (money-critical).
5. **CI guards** — e.g. `verify-banking-workflow-b-archived.mjs` proves archived banking forms stay unmounted.

### Current dual-path inventory (non-exhaustive; refresh when editing)

| Area | Old | New / canonical | Still active? | Class |
|---|---|---|---|---|
| Banking categorize | `BankTxCategorizationPage`, Workflow-B forms (`CategorizeDrawer`, `CreateExpenseForm`, …) | `BankingTransactionsDesignView` | Old **@archived** + CI guard; DesignView mounted | Mitigated `DUAL_PATH_OLD_ACTIVE` (old not routed) |
| Safety shell | `SafetyHome.tsx` v5 | `/safety/*` tab routes | Deprecated file remains; tabs are live | Watch until sunset |
| Dispatch list | `DispatchList.tsx` | `DispatchBoard` | Archived | Mitigated |
| Settlement CoA resolve | `catalogs.account_role_bindings` | `accounting.chart_of_accounts_roles` via `resolveRoleAccount` | **Legacy path still called by pay-run** | **ACTIVE `DUAL_PATH_OLD_ACTIVE`** → UNBOUND money |
| Accident drawer | `pages/safety/components/AccidentReportDrawer` | `components/safety/AccidentReportDrawer` | Deprecated copy | Mitigated if only new imported |

---

## D. CoA everything (UNBOUND money)

### Canonical stack

| Layer | Relation | Role |
|---|---|---|
| Chart | `catalogs.accounts` | Postable GL accounts (entity-scoped). Neon bypass count **1371** (2026-07-21). |
| Primary role map | `accounting.chart_of_accounts_roles` | Posters **must** resolve via `resolveRoleAccount` (`coa-roles/resolver.service.ts:334`, SQL `:166`). |
| Legacy bindings | `catalogs.account_role_bindings` | Fallback / old callers only. Neon active bindings = **0**. |
| UI | `CoaRolesPage` + `GET/PUT /api/v1/accounting/coa-roles` | Mounted via autoload (`docs/trackers/COA-ROLES-ROUTE-REACHABILITY-2026-07-21.md` — ALREADY_MOUNTED). |

### Neon role designation snapshot (bypass, 2026-07-21)

**Present (examples):** `ap_control`, `ar_control`, `ar_assigned_to_factor`, `factoring_advance_liability`, `factor_fee_expense`, `factor_reserve_held`, `factoring_recoursed_ar`, `uncategorized_expense`, `undeposited_funds`, lease/tax roles, …

**Missing (required for settlement / escrow / fuel paths):**  
`advance_recovery`, `driver_pay_expense`, `driver_payroll_clearing`, `escrow_liability_default`, `cash_clearing`, `ap_default`, `ar_default`, `fuel_expense_diesel`, `fuel_expense_def`, `fuel_expense_reefer`, …

**Bindings:** `catalogs.account_role_bindings` = **0** → any poster that **only** reads bindings (pay-run close) = **UNBOUND money** even when flags are ON.

### Law statement

> **0 bindings on Neon + missing primary role designations = UNBOUND money.**  
> Flags ON without resolvable CoA roles is not “working” — it is a live FAIL.

Owner Neon-apply required to designate missing roles; CODE must stop calling empty legacy bindings as the sole resolver (#3149).

---

## Operating rules for this ledger

1. **Scoreboard only** — this PR/docs file does not ship product wiring.
2. **Cursor** opens CODE PRs for each FAIL row; updates this ledger with PR links + LIVE PROOF.
3. **Coder** merges wiring PRs after CI + (financial) `JORGE-APPROVED` / Neon-apply as required.
4. Never claim **PASS** without: mounted route + FK/API hop + reverse UI + Neon/UI proof (RLS bypass for FORCED-RLS tables).
5. Do not edit `package.json` / `ci.yml` / `locked-guards.yml` to “prove” connectivity.
6. Sibling path audits (#3166–3178) remain the deep hop tables; **this file is the index**.

---

## Update log

| Date | Change |
|---|---|
| 2026-07-21 | Ledger opened: A economic 12×FAIL; B ops matrix; C dual-path definition; D CoA Neon snapshot (bindings=0; settlement/fuel/escrow roles missing). Deploy `e64fc4c`. |

---

## Spec sources reviewed (this ledger)

- `docs/specs/ARCHITECTURE-BLUEPRINT-2026-07-05.md` §9  
- Path audits in PRs #3166–#3178 (Expense/Bill/Settle/Claim-Legal/Invoice/Factor/Fuel/Bank/Maint/Safety/Advance/Escrow)  
- `docs/trackers/COA-ROLES-ROUTE-REACHABILITY-2026-07-21.md`  
- Live: healthz `e64fc4c`; Neon RLS-bypass CoA counts  

**Approved screens:** none required (tracker/docs-only).  
**Tab count:** unchanged.  
**Deviations / NEW SPEC:** None — consolidates Law §9 evidence; does not invent product tabs.
