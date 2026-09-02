# GO-26 PURGE LEDGER — driver_finance schema — 2026-09-02

Second of six schema PRs (`accounting` → **`driver_finance`** → `banking` → `factoring` →
`dispatch` → `fuel`). Method and header note same as `GO-26-PURGE-LEDGER-2026-09-02.md`.

## Rows captured before deletion

### driver_liabilities (5 rows)
All 5 already carried `status='voided'` from an earlier purge pass, but the void REGISTER columns
(`voided_at`/`void_reason`/`voided_by_user_id`, added this session in #19694) were never actually
stamped — status said voided, the audit trail didn't exist yet. Stamped now, then deleted:
`ea6c490b` (advance, $250, driver 40823a77), `e4b18966` (advance, $1.20, driver a785bea7),
`e530970f` (advance, $1.20, driver ac9ea24d), `7ee57f8d` (advance, $1.10, driver 6f082eb6),
`4692604f` (accident_damage recovery $850, driver 1e9384e4, origin=safety_accident 2b3d6512).

### deduction_schedule (4 rows)
One schedule row per liability above (`df5406b7`, `e10f8812`, `7498ff79`, `0a00623e`) — deleted
before their parent liability (real FK: `deduction_schedule` had no enforced constraint to
`driver_liabilities` in this direction found live, deleted first anyway as the safer order).

### escrow_ledger (3 rows)
`f5f12b7b` (driver c864a4bb, $250 hold, settlement S-2026-0002) · `ee5b027e` (driver 88c04cf5
"Juan USMCA-Battery", $250 hold, S-20260802-0258) · `f7342757` (driver ac9ea24d, $0.01 hold,
S-20260830-0014). NOT append-only (unlike its sibling `accounting.escrow_postings`) — deleted
clean.

### settlement_payment_events (3 rows) — COULD NOT DELETE, append-only
`22ad5e17` "marked_paid_manually" (CASCADE-SETL-VERIFY-01) · `b0bef857` "marked_paid_manually" ·
`34bc8ec6` "reopened_correction" (own payload: "ACCT-F5401 correction: erroneous manual-paid mark
made accidentally during a live-verify pass... no real payment was made, restoring to unpaid").
`ERROR: driver_finance.settlement_payment_events is append-only — UPDATE/DELETE blocked`. Same
class of hard architectural safeguard as `accounting.escrow_postings` — not forced through.

### driver_settlement_deductions (2 rows)
`1e76b251` (damage $850, driver 1e9384e4, companion to the driver_liabilities accident row) ·
`fb945a36` (fine $160, driver 49427973 — the owner's own driver record — "Fine — DOT: Speeding").
**Cross-schema FK found live**: `safety.civil_fines` row `38a20872` ("SAMPLE_BREAKDOWN_RESCUE_JULY
- speeding fine on Jorge / T120, TEST $160" — itself explicitly a test fixture, own notes field
says so) FKs `driver_settlement_deduction_id` to `fb945a36`. `safety` is NOT one of GO-26's six
ordered schemas — not purging it here. Cleared only the one dangling FK
(`driver_settlement_deduction_id = NULL` on that single civil_fines row) so the in-scope
driver_finance delete could proceed; the civil_fines row itself is untouched, flagged for whichever
lane eventually owns a `safety` schema purge.

### driver_reimbursements (1 row)
`edc714ed` "CC-3 live battery 2026-08-07 — toll reimbursement" $75, driver 40823a77, status=paid.

### abandonment_defaults (1 row)
Company-wide default config row (default_towing_cost_cents=$500, require_approval_above=$1,000,
default_replacement_premium_pct=25%, default_deadhead_rate=$2.50/mi). Reads like config on its
face, but the owner's own GO-26 PART 1.3 explicitly names `driver_finance.abandonment_defaults` in
the "probe signature" one-row-table list — trusting the owner's own classification, not
re-litigating it.

### trip_link_queue (1 row)
`36842693` — every field literally reads "TEST DATA keep".

### driver_deduction_buckets (1) + driver_deduction_bucket_events (1)
`8fed0f91` bucket for driver **9f35cf21 — the known is_sample_data=true sample driver** (a
reference this session's earlier sample-driver investigation had NOT found — clearing it here
removes one more blocker ahead of that driver's eventual deletion). `d882ff4b` its one charge
event, deleted first (child before parent).

## RESULT — live on Neon, before vs after

BEFORE (16 nonzero driver_finance tables) — see earlier baseline this session.

AFTER (7 nonzero, all expected):
```
driver_pay_rates 91 (KEEP config) · driver_advance_accounts 12 (HOLD -- reported, see OUTBOX) ·
settlement_payment_events 3 (append-only, could not delete) · escrow_balances 3 (HOLD -- reported) ·
escrow_settings 1 (KEEP config) · auto_deduction_policies 1 (KEEP config) ·
settlement_contract_terms_config 1 (KEEP config)
```
