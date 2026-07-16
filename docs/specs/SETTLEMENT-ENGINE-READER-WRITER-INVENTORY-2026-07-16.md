# Settlement engine — reader/writer inventory (B-C.P0)

**Date:** 2026-07-16  
**Scan base:** `origin/main` @ `4e6b0c237`  
**Scope:** `apps/backend` + `apps/frontend` (TypeScript/TSX only; comments stripped for WRITE classification; comment-only mentions marked REF)  
**Canonical (owner-ratified):** `driver_finance.*`  
**RETIRE:** `payroll.*` settlement tables, `settlement.*` (singular), `settlements.settlement_disputes` / `team_split_*`  
**This block:** read-only inventory + guard groundwork. **No writer repoint. No migrations. No settlement logic changes.**

Sources: `SETTLEMENT-ENGINE-CANONICAL-BLUEPRINT-2026-07-15.md`, tracker B-C.P0 / P2a–P2f, `PENDING-BLOCKS-TRACKER-2026-07-15.md`.

---

## 0. Counts (this scan)

| Namespace | Non-test WRITE sites | Non-test READ sites | Files touching |
|---|---:|---:|---:|
| `payroll.driver_settlements` / `payroll.driver_settlement_line_items` | **3** (all in one `.deprecated.ts`) | **11** | 12 |
| `settlement.*` (singular) | **0** live SQL | **0** live SQL (comment REF only) | 4 |
| `settlements.*` (plural retire) | **6** | **6** | 4 |
| `driver_finance.*` (settlement core tables below) | **60** | **115** | 87 |

**Frontend:** zero direct SQL against these tables. Settlement UI calls `/api/v1/driver-finance/*` (and legacy `/api/v1/payroll/aggregated` which itself prefers `driver_finance` when present).

---

## 1. Prod 0-count reproof

Blueprint §2 claimed RLS-bypassed **0 rows** across payroll / settlement / settlements / driver_finance settlement headers on 2026-07-15 (exception: `driver_finance.driver_bills` = 2 drafts).

| Check | Status |
|---|---|
| Re-run RLS-bypassed counts on Neon `br-fancy-credit-akjnd07a` for `payroll.driver_settlements`, `payroll.driver_settlement_line_items`, `settlement.settlement`, `settlement.settlement_line`, `settlements.settlement_disputes`, `settlements.team_split_configs`, `driver_finance.driver_settlements`, `driver_finance.settlement_lines`, `driver_finance.driver_settlement_deductions`, `driver_finance.driver_settlement_disputes`, `driver_finance.settlement_disputes` | **UNVERIFIED-NEEDS-PROD-READ** — this builder session has no Neon prod access |
| False-empty discipline | When GUARD re-proofs: same txn, `SELECT set_config('app.bypass_rls','lucia',true)` then counts |

---

## 2. Honest delta vs 2026-07-15 blueprint

`main` has already landed several collapse steps the blueprint listed as still open. Inventory reflects **code today**, not the blueprint snapshot:

| Blueprint claim (2026-07-15) | Code @ `4e6b0c237` |
|---|---|
| Payroll create/post still writes `payroll.*` | **Retired:** `payroll/driver-settlement.routes.ts` is 308→canonical; writers only remain in unmounted `driver-settlement.service.deprecated.ts` |
| `auto-deductions/apply.ts` inserts into `payroll.*` | **Already on `driver_finance`** (writes `settlement_lines` + updates header/policies). P2a still relevant if deduction **sub-ledger** (`driver_settlement_deductions`) is required instead of pay-lines |
| Team-splits `else` → payroll lines | **Already** inserts `driver_finance.settlement_lines` only; still **reads** `settlements.team_split_*` (P2f / P2b residual) |
| Approval on `settlement.*` | **Already** reads/writes `driver_finance.driver_settlements` / `settlement_lines` (P2.4a comments). P2d residual = confirm additive columns + unmount leftovers |
| Dual disputes | **Still true:** `settlements/disputes` writes `settlements.settlement_disputes`; canonical `driver_finance/settlement-dispute` writes `driver_settlement_disputes`; P6 service writes internal dup `driver_finance.settlement_disputes` |

---

## 3. `payroll.*` settlement tables

### 3.1 WRITE (live SQL — including unmounted deprecated)

| File | Line | RW | Table | Purpose | Target block |
|---|---:|---|---|---|---|
| `apps/backend/src/payroll/driver-settlement.service.deprecated.ts` | 349 | WRITE | `payroll.driver_settlements` | Deprecated create INSERT (unmounted) | **P2c** (+ P3 archive) |
| `apps/backend/src/payroll/driver-settlement.service.deprecated.ts` | 380 | WRITE | `payroll.driver_settlement_line_items` | Deprecated line INSERT (unmounted) | **P2c** (+ P3 archive) |
| `apps/backend/src/payroll/driver-settlement.service.deprecated.ts` | 645 | WRITE | `payroll.driver_settlements` | Deprecated post UPDATE (unmounted) | **P2c** (+ P3 archive) |

**Mounted payroll create path:** `apps/backend/src/payroll/driver-settlement.routes.ts` — **no SQL writes**; permanent 308 to `/api/v1/driver-finance/settlements`. Still registered in `index.ts` (~1040). Full unmount = **P3**.

### 3.2 READ / REF (non-test)

| File | Line | RW | Table | Purpose | Target block |
|---|---:|---|---|---|---|
| `apps/backend/src/driver-finance/settlement-pdf-renderer.service.ts` | 61 | REF | `payroll.driver_settlements` | Privilege probe before optional payroll PDF path | **P2c** / P3 (drop payroll fallback) |
| `apps/backend/src/driver-finance/settlement-pdf-renderer.service.ts` | 115 | READ | `payroll.driver_settlements` | Prefer payroll header if present | **P2c** / P3 |
| `apps/backend/src/driver-finance/settlement-pdf-renderer.service.ts` | 189 | READ | `payroll.driver_settlement_line_items` | Prefer payroll lines if present | **P2c** / P3 |
| `apps/backend/src/mdata/driver-aggregate.service.ts` | 369 | READ | `payroll.driver_settlements` | Driver aggregate metrics | **P2c** (repoint read → `driver_finance`) |
| `apps/backend/src/mdata/driver-aggregate.service.ts` | 377 | READ | `payroll.driver_settlements` | Driver aggregate metrics | **P2c** |
| `apps/backend/src/mdata/driver-aggregate.service.ts` | 387 | READ | `payroll.driver_settlements` | Driver aggregate metrics | **P2c** |
| `apps/backend/src/payroll/aggregated.routes.ts` | 14 | REF | `payroll.driver_settlements` | `relationExists` gate | **P2c** |
| `apps/backend/src/payroll/aggregated.routes.ts` | 18 | READ | `payroll.driver_settlements` | Aggregated payroll list (fallback before DF) | **P2c** |
| `apps/backend/src/payroll/settlement-shadow.service.ts` | 77 | READ | `payroll.driver_settlements` | Shadow compare | **P2c** / P3 |
| `apps/backend/src/payroll/driver-settlement.service.deprecated.ts` | 97, 128, 442, 522 | READ | payroll header/lines | Deprecated service reads | **P2c** / P3 |
| `apps/backend/src/payroll/driver-settlement.routes.ts` | 5 | REF | (comment) | Documents retirement | P3 |
| `apps/backend/src/settlements/auto-deductions/apply.ts` | 13 | REF | (comment) | Documents STEP 3 removal | P2a (semantic residual) |
| `apps/backend/src/settlements/team-splits/apply.ts` | 145 | REF | (comment) | Documents no payroll fallback | P2b |

### 3.3 Tests mentioning payroll writes (not production writers)

| File | Notes | Target |
|---|---|---|
| `apps/backend/src/payroll/__tests__/driver-settlement.test.ts` | Mocks INSERT/UPDATE payroll | P2c / P3 |
| `apps/backend/src/payroll/__tests__/settlement-recovery-post-je.test.ts` | Mocks UPDATE payroll | P2c / P3 |
| `apps/backend/src/payroll/__tests__/aggregated.test.ts` | Mocks payroll relation | P2c |
| `apps/backend/src/payroll/__tests__/settlement-shadow.test.ts` | Mocks payroll SELECT | P2c |

---

## 4. `settlement.*` (singular) — RETIRE

No live `INSERT`/`UPDATE`/`FROM` against `settlement.settlement` / `settlement_line` / `settlement_deduction` in non-test code. Remaining hits are **documentation comments** in:

| File | Line | RW | Purpose | Target |
|---|---:|---|---|---|
| `apps/backend/src/settlements/approval.service.ts` | 12 | REF | Documents prior RETIRE wiring; service now on `driver_finance` | **P2d** (confirm + P3) |
| `apps/backend/src/settlements/pre-settlements.routes.ts` | 38–67 | REF | Documents removed RETIRE queries | P3 |
| `apps/backend/src/driver-finance/settlement-payrun-close.service.ts` | 595 | REF | Notes held migration for settlement.* family | P1/P2d context |
| `apps/backend/src/settlements/__tests__/approval-service-canonical.db.test.ts` | — | TEST | Canonical repoint test | P2d |

---

## 5. `settlements.*` (plural) — RETIRE (still live)

### 5.1 Disputes → **P2e**

| File | Line | RW | Table | Purpose | Target |
|---|---:|---|---|---|---|
| `apps/backend/src/settlements/disputes/disputes.routes.ts` | 96 | WRITE | `settlements.settlement_disputes` | Create dispute | **P2e** |
| `apps/backend/src/settlements/disputes/disputes.routes.ts` | 163, 176, 211 | READ | `settlements.settlement_disputes` | List/get | **P2e** |
| `apps/backend/src/settlements/disputes/disputes.routes.ts` | 226, 271 | WRITE | `settlements.settlement_disputes` | Review / resolve | **P2e** |
| `apps/backend/src/settlements/disputes/disputes.routes.ts` | 123, 296 | REF | resource_type string | Audit resource type | **P2e** |
| `apps/backend/src/settlements/disputes/disputes.routes.ts` | 258 | WRITE | `driver_finance.settlement_lines` | Adjustment line on resolve (canonical lines) | **P2e** (keep DF; drop plural disputes) |

Mounted alongside canonical: `registerSettlementsDisputesRoutes` + `registerSettlementDisputeRoutes` in `index.ts`.

### 5.2 Team-split config → **P2f** (apply residual **P2b**)

| File | Line | RW | Table | Purpose | Target |
|---|---:|---|---|---|---|
| `apps/backend/src/settlements/team-splits/team-splits.routes.ts` | 80 | READ | `settlements.team_split_configs` | List configs | **P2f** |
| `apps/backend/src/settlements/team-splits/team-splits.routes.ts` | 105 | WRITE | `settlements.team_split_configs` | Create config | **P2f** |
| `apps/backend/src/settlements/team-splits/team-splits.routes.ts` | 163 | WRITE | `settlements.team_split_configs` | Update config | **P2f** |
| `apps/backend/src/settlements/team-splits/team-splits.routes.ts` | 202 | WRITE | `settlements.team_split_load_overrides` | Load override INSERT | **P2f** |
| `apps/backend/src/settlements/team-splits/apply.ts` | 50 | READ | `settlements.team_split_load_overrides` | Resolve override | **P2b** / **P2f** |
| `apps/backend/src/settlements/team-splits/apply.ts` | 80 | READ | `settlements.team_split_configs` | Resolve config | **P2b** / **P2f** |
| `apps/backend/src/settlements/team-splits/apply.ts` | 153 | WRITE | `driver_finance.settlement_lines` | Apply split lines (already canonical) | **P2b** (done for write; keep) |

Canonical config table already written from `mdata/driver-team.service.ts` → `driver_finance.team_settlement_splits` (see §6).

---

## 6. `driver_finance.*` settlement core — WRITE sites

Tables covered: `driver_settlements`, `settlement_lines`, `driver_settlement_deductions`, `driver_settlement_disputes`, `settlement_disputes` (internal dup), `team_settlement_splits`, `auto_deduction_policies`.

| File | Line | RW | Table | Purpose | Target / note |
|---|---:|---|---|---|---|
| `apps/backend/src/driver-finance/settlements.routes.ts` | 326, 350, 395, 448 | WRITE | header / lines | Canonical create / update / lock | **canonical keep** |
| `apps/backend/src/driver-finance/settlements-mvp.routes.ts` | 150, 174, 267 | WRITE | header / lines | MVP create path | keep / consolidate later |
| `apps/backend/src/driver-finance/settlements-load-bookended.service.ts` | 112, 207, 284 | WRITE | header | Bookended settlement lifecycle | keep |
| `apps/backend/src/driver-finance/weekly-close.routes.ts` | 92, 119 | WRITE | header / lines | Weekly close create | keep |
| `apps/backend/src/driver-finance/settlement-engine.ts` | 147, 165, 183, 200 | WRITE | lines | Engine pay/deduction/team lines | keep |
| `apps/backend/src/driver-finance/settlement-contract-terms.service.ts` | 294, 367, 685 | WRITE | lines | Contract terms → lines | keep |
| `apps/backend/src/driver-finance/settlement-deduction-cap.service.ts` | 277, 288 | WRITE | lines / deductions | Cap apply | keep |
| `apps/backend/src/driver-finance/deductions.service.ts` | 125 | WRITE | deductions | Deduction create | keep |
| `apps/backend/src/driver-finance/escrow-deduction-pending.service.ts` | 390 | WRITE | deductions | Escrow pending → deduction | keep |
| `apps/backend/src/driver-finance/abandonment.service.ts` | 343 | WRITE | lines | Abandonment charge line | keep |
| `apps/backend/src/driver-finance/pre-settlement.routes.ts` | 238, 326 | WRITE | header | Pre-settlement status | keep |
| `apps/backend/src/driver-finance/settlement-payment.service.ts` | 147, 189, 232, 281, 344 | WRITE | header | Payment state machine | keep |
| `apps/backend/src/driver-finance/settlement-payrun-close.service.ts` | 643 | WRITE | header | Payrun close | keep |
| `apps/backend/src/driver-finance/settlement-dispute.service.ts` | 240, 308, 384, 438 | WRITE | `driver_settlement_disputes` | **Canonical disputes** | **P2e keep** |
| `apps/backend/src/driver-finance/settlement-disputes-p6.service.ts` | 54, 141, 261, 353 | WRITE | `settlement_disputes` | **Internal duplicate table** | **P2e converge/retire** |
| `apps/backend/src/settlements/approval.service.ts` | 276, 324, 475, 495, 519 | WRITE | lines / header | Approval workflow (already DF) | **P2d** residual |
| `apps/backend/src/settlements/auto-deductions/apply.ts` | 64, 74, 92 | WRITE | lines / policies / header | Auto-deduct apply | **P2a** (consider sub-ledger) |
| `apps/backend/src/settlements/auto-deductions/policy.routes.ts` | 75, 119, 149 | WRITE | `auto_deduction_policies` | Policy CRUD | keep (canonical) |
| `apps/backend/src/settlements/team-splits/apply.ts` | 153 | WRITE | lines | Team split apply | **P2b** (write done) |
| `apps/backend/src/settlements/disputes/disputes.routes.ts` | 258 | WRITE | lines | Dispute adjustment line | **P2e** |
| `apps/backend/src/mdata/driver-team.service.ts` | 453 | WRITE | `team_settlement_splits` | Canonical team config write | **P2f keep** |
| `apps/backend/src/accounting/settlement-posting/recover-from-driver.service.ts` | 105 | WRITE | deductions | Recovery deduction | keep |
| `apps/backend/src/accounting/settlement-posting/settlement-posting.service.ts` | 446, 587 | WRITE | deductions | GL posting status on deductions | keep |
| `apps/backend/src/governance/void-cancel-executors.ts` | 622 | WRITE | header | Void/cancel settlement | keep |
| `apps/backend/src/payroll/driver-settlement.service.deprecated.ts` | 608, 620 | WRITE | deductions | Deprecated path updates DF deductions | **P2c** / P3 |

---

## 7. `driver_finance.*` settlement core — READ sites (non-test)

| File | RW | Lines (table shorthand) | Purpose | Target |
|---|---|---|---|---|
| `apps/backend/src/driver-finance/settlements.routes.ts` | READ | 126,142,198,214,258,385,435,481:header; 267:lines | Canonical list/detail | keep |
| `apps/backend/src/driver-finance/settlements-mvp.routes.ts` | READ | 248:header | MVP read | keep |
| `apps/backend/src/driver-finance/settlements-load-bookended.service.ts` | READ | 89,265,482:header; 194:lines | Bookended reads | keep |
| `apps/backend/src/driver-finance/settlement-engine.ts` | READ | 187,204:lines | Engine re-read | keep |
| `apps/backend/src/driver-finance/settlement-contract-terms.service.ts` | READ | 214,234,410:lines | Terms | keep |
| `apps/backend/src/driver-finance/settlement-deduction-cap.service.ts` | READ | 206:lines; 240:deductions | Cap | keep |
| `apps/backend/src/driver-finance/deductions.service.ts` | READ | 112:deductions | List | keep |
| `apps/backend/src/driver-finance/pre-settlement.routes.ts` | READ | 77,129,183,303:header; 145:lines | Pre-settlement board | keep |
| `apps/backend/src/driver-finance/settlement-payment.service.ts` | READ | 46:header | Payment load | keep |
| `apps/backend/src/driver-finance/settlement-payrun-close.service.ts` | READ | 145,199:header; 198:lines; 171:deductions | Payrun | keep |
| `apps/backend/src/driver-finance/settlement-pdf-renderer.service.ts` | READ | 166:header; 206:lines | PDF DF path | keep (+ drop payroll §3) |
| `apps/backend/src/driver-finance/settlement-render.routes.ts` | READ | 60,86:header; 76:lines | HTML render | keep |
| `apps/backend/src/driver-finance/settlement-dispute.service.ts` | READ | header + `driver_settlement_disputes` | Canonical disputes | **P2e keep** |
| `apps/backend/src/driver-finance/settlement-disputes-p6.service.ts` | READ | header + `settlement_disputes` | Dup disputes | **P2e** |
| `apps/backend/src/driver-finance/auto-pay.cron.ts` | READ | 30:header | Auto-pay cron | keep |
| `apps/backend/src/driver-finance/cash-advance-owner-approval.service.ts` | READ | 212:header | Owner approval context | keep |
| `apps/backend/src/driver-finance/escrow-separation.service.ts` | READ | 68:deductions | Escrow separation | keep |
| `apps/backend/src/settlements/approval.service.ts` | READ | header/lines | Approval | **P2d** |
| `apps/backend/src/settlements/approval.routes.ts` | READ | 284:header | Approval routes | **P2d** |
| `apps/backend/src/settlements/auto-deductions/apply.ts` | READ | 40:policies | Apply | **P2a** |
| `apps/backend/src/settlements/auto-deductions/policy.routes.ts` | READ | 52:policies | Policy list | keep |
| `apps/backend/src/settlements/disputes/disputes.routes.ts` | READ | 84,139,165,212:header | Plural disputes (joins DF header) | **P2e** |
| `apps/backend/src/mdata/driver-team.service.ts` | READ | 143,418,501:team_settlement_splits | Team splits | **P2f keep** |
| `apps/backend/src/accounting/settlement-posting/settlement-bill-payment-posting.service.ts` | READ | header/lines/deductions | Bill payment posting | keep |
| `apps/backend/src/accounting/settlement-posting/settlement-posting.service.ts` | READ | header/deductions | Settlement JE | keep |
| `apps/backend/src/accounting/account-register.service.ts` | READ | 198:header | Register | keep |
| `apps/backend/src/accounting/transaction-register.routes.ts` | READ | 126:header | Tx register | keep |
| `apps/backend/src/admin/launch-readiness.service.ts` | READ | header + dup disputes | Launch readiness KPIs | **P2e** (point to canon) |
| `apps/backend/src/banking/categorization.routes.ts` | READ | deductions | Bank categorize | keep |
| `apps/backend/src/banking/obligation-reconcile.routes.ts` | READ | header | Obligation match | keep |
| `apps/backend/src/banking/reconciliation.routes.ts` | READ | header | Reconcile | keep |
| `apps/backend/src/cash-advances/cash-advances.routes.ts` | READ | lines | CA ↔ settlement | keep |
| `apps/backend/src/dispatch/load-profitability.service.ts` | READ | header | Load profit | keep |
| `apps/backend/src/dispatch/load-settlement-summary.routes.ts` | READ | header | Load settlement summary | keep |
| `apps/backend/src/dispatch/update-load.service.ts` | READ | header | Load update guard | keep |
| `apps/backend/src/driver-manager/role-views/dm-home.service.ts` | READ | header | DM home | keep |
| `apps/backend/src/governance/void-cancel-executors.ts` | READ | header | Void | keep |
| `apps/backend/src/liabilities/liabilities.routes.ts` | READ | lines | Liabilities | keep |
| `apps/backend/src/master-data/drivers/operations-depth/payroll-history.service.ts` | READ | header | Driver ops depth | keep |
| `apps/backend/src/master-data/drivers/operations-depth/settlement-history.service.ts` | READ | header | Settlement history | keep |
| `apps/backend/src/payroll/aggregated.routes.ts` | READ | 31:header | DF branch of aggregate | keep |
| `apps/backend/src/payroll/settlement-shadow.service.ts` | READ | deductions | Shadow | P2c/P3 |
| `apps/backend/src/payroll/driver-settlement.service.deprecated.ts` | READ | deductions | Deprecated | P2c/P3 |
| `apps/backend/src/payroll-integration/tms-settlements-pull.ts` | READ | header | QBO payroll integration pull | keep |
| `apps/backend/src/reports/*` (cash-flow, dispatch-margin, driver-pay-history, driver-settlement-summary, settlement-summary, queries/driver-settlements-weekly) | READ | header/lines/deductions | Reports | keep |
| `apps/backend/src/tax-documents/box1-aggregation.service.ts` | READ | header/lines | Tax box1 | keep |

---

## 8. Frontend (API clients / pages — no SQL)

| File | Role | Notes | Target |
|---|---|---|---|
| `apps/frontend/src/api/driverFinance.ts` | API | Canonical settlements, disputes, pre-settlements, escrow | keep |
| `apps/frontend/src/api/payrollAggregated.ts` | API | `/api/v1/payroll/aggregated` (backend dual-reads payroll then DF) | **P2c** when aggregate drops payroll |
| `apps/frontend/src/pages/driver-finance/*` | UI | Settlements list/detail/disputes/close | keep |
| `apps/frontend/src/pages/drivers/AutoDeductionPolicies.tsx` | UI | Auto-deduction policies | **P2a** |
| `apps/frontend/src/pages/drivers/SettlementDispute*.tsx` | UI | Disputes | **P2e** |
| `apps/frontend/src/components/driver-profile/SettlementsSection.tsx` | UI | Profile settlements | keep |
| `apps/frontend/src/pages/accounting/PayrollAggregatedPage.tsx` | UI | Aggregated payroll | **P2c** |
| `apps/frontend/src/pages/accounting/AccountingPreSettlementsPage.tsx` | UI | Pre-settlements | keep |

No frontend file contains `payroll.driver_settlements` or `driver_finance.driver_settlements` SQL identifiers.

---

## 9. P2a–P2f checklist (from this inventory)

| Block | Intent | Inventory verdict @ `4e6b0c237` |
|---|---|---|
| **P2a** | Auto-deductions → DF deduction sub-ledger | Payroll writers **gone**; apply writes **`settlement_lines`** not `driver_settlement_deductions` — confirm/fix semantics |
| **P2b** | Team-splits apply both branches → DF | Line **writes** already DF; still **reads** `settlements.team_split_*` |
| **P2c** | Retire payroll create/post | Routes 308'd; **3 WRITE** remain in `.deprecated.ts`; readers remain (PDF, aggregate, shadow, mdata) |
| **P2d** | Approval → canonical | Service already on DF; confirm columns + tests; comment cleanup |
| **P2e** | Converge disputes → `driver_settlement_disputes` | Plural `settlements.*` + DF dup `settlement_disputes` still live |
| **P2f** | Team-split config → `team_settlement_splits` | Routes still write `settlements.team_split_*`; DF table also written from `driver-team.service` |
| **P1** | Additive approval columns | HOLD migration (owner apply) — not this PR |
| **P3** | Unmount + archive | After P2* |
| **P4** | G4 harden | Sibling: `verify-no-payroll-settlement-writes.mjs` exists (**unwired** today); this PR adds inventory ratchet |

---

## 10. Machine allowlist — payroll settlement WRITE files

Guard `scripts/verify-settlement-engine-inventory.mjs` parses the fenced block below. Any **new** file (not listed) that contains `INSERT INTO` / `UPDATE` against `payroll.driver_settlements` or `payroll.driver_settlement_line_items` fails CI.

```settlement-engine-payroll-write-allowlist
apps/backend/src/payroll/driver-settlement.service.deprecated.ts
```

---

## 11. Related existing guards

| Guard | Role | Wired? |
|---|---|---|
| `scripts/verify-canonical-table-writes.mjs` | G4 RETIRE write/FK ratchet (broader) | yes |
| `scripts/verify-no-payroll-settlement-writes.mjs` | Shrink-only payroll settlement writers (excludes `.deprecated.ts`) | **no** (baseline count 0) |
| `scripts/verify-settlement-engine-inventory.mjs` | This PR — new file writing payroll settlement tables must appear in §10 | **yes (this PR)** |

---

*End of inventory. Refresh this doc when a P2* PR removes or moves a site; update §10 allowlist only when removing the last deprecated writer (allowlist may shrink, never grow without owner note).*
