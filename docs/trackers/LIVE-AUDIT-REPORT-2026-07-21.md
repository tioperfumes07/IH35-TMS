# LIVE BLOCK AUDIT — 2026-07-21 (CORRECTED v2)

> **CORRECTION:** v1 (GAP=36 / NOISE=383) undercounted by treating AUDIT-NOTE as NOISE.
> Classify agent mapped backlog-verify OPEN→GAP. Spot-check: `0441-mod10-payment-status-panel-404`
> was wrongly NOISE — `registerSettlementPaymentRoutes` still unmounted on main.
>
> **UNIVERSE CORRECTION (this revision):** the first cut published a `1,185` denominator and
> hardcoded it in an `assert`. At this audit's own base SHA the reconciler universe was
> **1,191** — 6 blocks that were already DONE on main were silently dropped
> (`0091-g7-1`, `paritytable-a1-controlled-expansion`, `paritytable-a2-group-bands`, `paritytable-a3-controlled-pagination`, `paritytable-a4-external-sort`, `paritytable-a5-controlled-selection`).
> The denominator is now DERIVED from `docs/trackers/block-reconciliation-data.json` and
> cross-checked on every run, so it cannot drift again.

**Base SHA:** `cde575b6463a3a3ac158a152d32d6bf219e1b72c`  
**Deploy SHA:** `de92db2` (lag)  
**Generated:** 2026-07-21T14:47:40.344735+00:00  
**Re-perform:** `node scripts/ops/publish-live-audit-2026-07-21.mjs --check`

## Headline (active universe = 1,191)

| Pile | v2 (authoritative) | v1 (superseded) |
|---|---:|---:|
| BUILT | 721 | 667 |
| GAP | 291 | 36 |
| NEEDS-PROD | 24 | 71 |
| NEEDS-OWNER | 106 | 28 |
| NOISE | 39 | 383 |
| UNVERIFIED | 10 | — |
| **SUM** | **1191** | 1185 |

## Critical GAPs (re-verified)

### Settlement payment routes unmounted — CRITICAL
- Blocks: `0441-mod10-payment-status-panel-404`
- Proof: origin/main index.ts has no registerSettlementPaymentRoutes
- Rec: Mount after CAS (#3079 on main); financial HOLD

### Settlement approval company-scoping — CRITICAL
- Blocks: `0091-g1-3`
- Proof: backlog OPEN: approval.routes trust query-string OC
- Rec: Membership check; financial HOLD

### Deductions never reduce settlement — CRITICAL
- Blocks: `0441-mod10-deductions-never-reduce-settlement`
- Proof: backlog OPEN; residual after #3084
- Rec: Prove weekly-close uses sub-ledger; HOLD

### TONU/cancel → AR — CRITICAL
- Blocks: `flow3-cancellation-billing-deduction-linkage`, `flow3-cancellation-auto-customer-charge`
- Proof: Neon: charge_cents yes; charge_id/invoice FK no
- Rec: Additive FK + AR poster; HOLD

### bills.amount_cents nullable — HIGH
- Blocks: `0519-lg1-5-nullable-financial-columns_DISPATCH`
- Proof: Neon nullable YES; 0/16196 null rows
- Rec: NOT NULL; HOLD

### Two settlement engines — HIGH
- Blocks: `0091-c1-1-two-settlement-engines_DISPATCH`
- Proof: deprecated posting engine still mounted
- Rec: Unmount retire engine

### STMT-2 opening balances — HIGH
- Blocks: `STMT-2-opening-balances`
- Proof: owner/Martin gate
- Rec: NEEDS-OWNER

## Neon values — transcribed, NOT re-queried by this generator

- Source: read-only Neon session on br-fancy-credit-akjnd07a with app.bypass_rls=lucia
- Obtained: 2026-07-21
- Re-queried by this generator: **no**
- These values were transcribed from that session. This generator performs NO database or network access, so it cannot and does not re-verify them. Re-query before relying on any of them for a financial decision.

- `needs_prod_neon_verdicts_2026_07_21` = `[object Object]`
- `payment_idempotency_cols` = `true`
- `auto_deduction_link_col` = `true`
- `team_split_override_cols` = `true`
- `driver_finance_tables` = `true`
- `payroll_table_still_exists_as_empty_retire` = `true`
- `bills_amount_cents_nullable` = `true`
- `load_cancellations_charge_id` = `false`
- `load_cancellations_has_charge_cents` = `true`
- `bank_transactions_rows` = `10427`
- `bills_total_rows` = `16196`
- `bills_null_amount_rows` = `0`
- `recon_runs_rows` = `173`
- `drivers_rows_rls_bypass` = `178`
- `dual_dispute_tables` = `true`
- `driver_finance_settlements_rows` = `0`
- `settlement_payment_routes_mounted` = `false`
- `zero_row_settlement_window_still_open` = `true`

## Full GAP list

See `docs/trackers/LIVE-AUDIT-GAPS-2026-07-21.md` (291 items).

## Caveat

GAP includes backlog OPEN (many AUDIT-NOTE). Sample before scheduling. Financial=HOLD. UNVERIFIED needs live pass.
