# Financial NEEDS-VERIFY Sweep — pre-staged signatures for GUARD — 2026-06-25

Per Jorge's directive #3/#5. **Real names extracted from canonical block docs** (`docs/accounting/block-NN-*.md`,
`docs/blocks/ACCOUNTING-FINANCE-CONNECTIONS/AF-*.txt`) — NOT guessed. GUARD verifies each against live prod:
**files-on-main? → tables exist? → live posting/behavior evidence?** → classify **DONE / PENDING /
BUILT-BUT-NEVER-RUN**.

## Decisive prod fact (GUARD, live)
`accounting.journal_entry_postings` currently carries `source_transaction_type = 'invoice'` **ONLY** — zero
postings from settlement / escrow / factoring / fuel / maintenance-AP / bank-recon. So **none of the posting
blocks below have live posting proof.** This is consistent with the posting flags (`BILL_GL_POSTING_ENABLED`
etc.) being **OFF** — so for each, the sweep must distinguish **BUILT-BUT-GATED-OFF** (code present, never run)
from **NOT-BUILT**. "No postings" alone is not proof of "not built."

---

## block-22 — Driver Settlement Engine
- **Files:** `apps/backend/src/payroll/driver-settlement.service.ts` (+ `__tests__/driver-settlement.test.ts`)
- **Tables:** `driver_finance.settlement_lines` → `driver_finance.driver_settlements` (per §4; no `load_id`)
- **Verify:** service on main? settlement→JE posting path? any `source_transaction_type='settlement'` posting (expect none → BUILT-BUT-NEVER-RUN if code present).

## block-23 — Escrow Posting Flow
- **Files:** `apps/backend/src/accounting/escrow/…` (+ `__tests__/service-balance-math.test.ts`)
- **Tables:** `accounting.escrow_accounts`, `accounting.escrow_postings`
- **Verify:** tables exist on prod? escrow JE path? (ties to the EscrowForfeit M-1 debt — forfeit route still unimplemented.)

## block-24 — Factoring Posting
- **Files:** `apps/backend/src/accounting/factoring-posting/poster.service.ts`, `accounting/factoring-advances.routes.ts` (+ scenario/tenant tests)
- **Endpoint:** factoring-advances route
- **Verify:** poster on main? any factoring posting in JE (expect none).

## block-25 — Factoring Fees & Reserves
- **Files:** `apps/backend/src/accounting/factoring-fees-posting/poster.service.ts`; FE `FactoringDetailPage.tsx`, `FactorReserveCard.tsx`
- **Verify:** fee-as-expense + reserve-balance posters on main; reserve reconciliation behavior.

## block-26 — Factoring Reconciliation
- **Files:** `apps/backend/src/accounting/factor-reconciliation/recon.service.ts` + `routes.ts`; FE `api/accounting.ts`
- **Tables:** `factor.faro_daily_imports`, `factor.faro_invoice_lines`, `factor.reconciliation_items`, `factor.reconciliation_runs`
- **Migration:** `0224_block_26_factor_reconciliation.sql`
- **Verify:** migration applied on prod? recon route returns? tolerance/match-state logic.

## block-27 — Fuel Expense Posting
- **Files:** `apps/backend/src/accounting/fuel-posting/poster.service.ts`
- **Tables:** `fuel.fuel_transactions`, `fuel.events`, `driver_finance.driver_advances`, `driver_finance.driver_liabilities`
- **Verify:** poster on main; fuel→JE path; (note §4: every diesel expense MUST FK to a load — confirm).

## block-28 — Maintenance AP Posting
- **Files:** `apps/backend/src/accounting/maintenance-posting/poster.service.ts`; `maintenance/work-orders.routes.ts`, `work-orders/work-orders.routes.ts`
- **Tables:** `accounting.bill_lines` (+ `accounting.bills`)
- **Verify:** WO→bill→JE path; multi-line bill test; any maintenance posting in JE (expect none).

## block-29 — Bank Reconciliation Engine
- **Files:** `apps/backend/src/accounting/bank-recon/match.service.ts`; `banking/reconciliation.routes.ts`
- **Tables:** `banking.bank_transactions`, `banking.transfers`, `accounting.journal_entries`, `accounting.journal_entry_postings`, `accounting.payments`, `accounting.bill_payments`
- **Migration:** `0219_block_29_bank_reconciliation_matches.sql`
- **Verify:** migration applied? auto-vs-manual match; resolve-difference (Q8); reconcile-commit posting path.

---

## AF-1…AF-8 — Accounting/Finance program (docs are PROGRAM-LEVEL, not file manifests)
> **Finding:** `docs/blocks/ACCOUNTING-FINANCE-CONNECTIONS/AF-*.txt` are design/program docs — they do **not**
> enumerate signature code files. So AF blocks **cannot** be verified by file-presence; they need **scope-based**
> verification (does the described capability exist + run?). Source paths for GUARD:

| Block | Source doc | Scope to verify (table/capability hint) |
|---|---|---|
| AF-1 entity-COA-fix | `…/AF-1-entity-coa-fix.txt` | `catalogs.accounts` entity-partition (Path B); is COA entity-scoped? |
| AF-2 qbo-drift | `…/AF-2-qbo-drift.txt` | QBO-vs-TMS drift detection — exists/runs? |
| AF-3 account-registers | `…/AF-3-account-registers.txt` | `accounting.period_cash_basis_snapshot`; per-account registers UI/endpoint? |
| AF-4 ap-bills-migration | `…/AF-4-ap-bills-migration.txt` | AP bills migration — applied? |
| AF-5 stub-catalogs | `…/AF-5-stub-catalogs.txt` | catalog stubs present? |
| AF-6 finance-hub | `…/AF-6-finance-hub.txt` | Finance Hub surface (FH-3..FH-8 design) — built vs design-only? |
| AF-7 money-controls | `…/AF-7-money-controls.txt` | money controls (maker≠checker, approvals) — wired? |
| AF-8 payroll-bridge | `…/AF-8-payroll-bridge.txt` | payroll↔GL bridge — exists? |

**Recommended sweep order:** verify the 8 concrete posting blocks (22–29) first (file+table+JE evidence →
clean DONE/PENDING/BUILT-BUT-NEVER-RUN), then the AF program blocks by scope. GUARD does the live-prod half
(table existence + JE evidence) since prod reads are gated.

---

## ✅ RESOLVED 2026-06-26 — final verdicts (both halves complete)

**Posting blocks 22–29 = BUILT (code+schema verified) / behavior-pending-flag.** Repo half: all 8 posters
on `origin/main` (coder). Prod half: all signature tables exist + migrations 0224 & 0219 applied (GUARD).
`journal_entry_postings` carries `source_transaction_type='invoice'` ONLY → all 8 are **gated OFF
(BUILT-BUT-NEVER-RUN), not missing**. Remaining per block = live behavior proof when its flag flips
(GUARD, part of each money-switch sign-off).

**AF program:** AF-1 **LIVE** · AF-3 **LIVE** (`accounting.periods`, not `accounting_periods`) · AF-7
**PARTIAL** (`cash_advance_owner_approval_audit` exists; framework scope-level) · AF-8 **NOT-BUILT-YET
(expected, Cycle-5)** · AF-2 **PARTIAL** (drift detection BUILT via `qbo/sync-conflict-detection.routes.ts`;
sync-execution gated) · AF-4 **NOT-BUILT (expected; gated, sequenced behind AF-2)** · AF-5 **PARTIAL/
in-progress** (catalog build-out shipping; per-catalog count pending) · AF-6 **PARTIAL** (FH sub-modules
built — loan-wizard/amortization/calculator; hub-landing 404-by-design).

Full status + reliability-lane PRs: `docs/trackers/MASTER_TRACKER_2026-06-25.md` §11.
