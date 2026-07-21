# LIVE BLOCK AUDIT — 2026-07-21 (CORRECTED v2)

> **CORRECTION:** v1 (GAP=36 / NOISE=383) undercounted by treating AUDIT-NOTE as NOISE.
> Classify agent mapped backlog-verify OPEN→GAP. Spot-check: `0441-mod10-payment-status-panel-404`
> was wrongly NOISE — `registerSettlementPaymentRoutes` still unmounted on main.

**Base SHA:** `cde575b6463a3a3ac158a152d32d6bf219e1b72c`  
**Deploy SHA:** `de92db2` (lag)  
**Generated:** 2026-07-21T14:47:40.344735+00:00

## Headline (active universe = 1,185)

| Pile | v2 (authoritative) | v1 (superseded) |
|---|---:|---:|
| BUILT | 709 | 667 |
| GAP | 287 | 36 |
| NEEDS-PROD | 34 | 71 |
| NEEDS-OWNER | 106 | 28 |
| NOISE | 39 | 383 |
| UNVERIFIED | 10 | — |
| **SUM** | **1185** | 1185 |

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

## Neon proofs

- `payment_idempotency_cols` = `True`
- `auto_deduction_link_col` = `True`
- `team_split_override_cols` = `True`
- `driver_finance_tables` = `True`
- `payroll_table_still_exists_as_empty_retire` = `True`
- `bills_amount_cents_nullable` = `True`
- `load_cancellations_charge_id` = `False`
- `load_cancellations_has_charge_cents` = `True`
- `bank_transactions_rows` = `10427`
- `bills_total_rows` = `16196`
- `bills_null_amount_rows` = `0`
- `recon_runs_rows` = `173`
- `drivers_rows_rls_bypass` = `178`
- `dual_dispute_tables` = `True`
- `driver_finance_settlements_rows` = `0`
- `settlement_payment_routes_mounted` = `False`
- `zero_row_settlement_window_still_open` = `True`

## Full GAP list

See `docs/trackers/LIVE-AUDIT-GAPS-2026-07-21.md` (287 items).

## Caveat

GAP includes backlog OPEN (many AUDIT-NOTE). Sample before scheduling. Financial=HOLD. UNVERIFIED needs live pass.
