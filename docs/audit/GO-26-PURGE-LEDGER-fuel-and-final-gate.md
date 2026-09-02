# GO-26 PURGE LEDGER — fuel schema (last of six) + FULL cross-schema done-gate — 2026-09-02

`accounting` → `driver_finance` → `banking` → `factoring` → `dispatch` → **`fuel`** — all six
schemas done.

## Rows captured before deletion — fuel

- **fuel_transactions** (3): `f708e956` "TEST CODEX breakdown relay fuel L-20260824-0007 T149;
  void at launch" $40, load_exemption_reason="TEST_FIXTURE_VOID_AT_LAUNCH_NO_REAL_LOAD" ·
  `50dd2e18` "LIVE-GATE-PROVE yard fuel test, no active trip" $0.05 · `0fc8ade3`
  "WAVE3_TEST_DATA_2026-08-21 -- CC-1 fuel proof-of-path" $480
- **fraud_alerts** (1): `65274de9`, "TEST DATA keep" rule/resolution, references fuel_transaction
  `f708e956` above — deleted first (child before parent)
- **loves_prices_daily** (1): every field "TEST DATA keep"

`fuel.fuel_card_overage_policies` and `fuel.fuel_planner_settings` (1 row each) are PART-2
keep-list config, untouched.

## RESULT — fuel schema, live on Neon

AFTER (2 nonzero, both KEEP-list): `fuel_card_overage_policies 1`, `fuel_planner_settings 1`.
Zero non-keep-list rows remain.

---

## FULL CROSS-SCHEMA DONE-GATE — all six purged schemas + telematics, run live after this PR

Owner's exact query (`docs/bus/GO-26-PURGE-TO-ZERO-AND-CONSOLIDATE-2026-09-02.md`), run against
`tiny-field-89581227` / `br-fancy-credit-akjnd07a`, `SET LOCAL app.bypass_rls = 'lucia'`:

```
accounting:
  qbo_accounts 365 · chart_of_accounts_roles 49 · expense_category_account_map 33 · periods 24 ·
  escrow_accounts 21 (HOLD -- reported #19775, not decided) ·
  escrow_postings 6 (append-only, needs a reversing entry, not a forced delete) ·
  fixed_asset_classes 4 · sales_tax_agencies 2 · vendor_classifications 1 ·
  customer_classifications 1 · banking_rules 1 ·
  period_cash_basis_snapshot 1 (append-only, IH35_CASH_BASIS_SNAPSHOT_LOCKED) ·
  settlement_posting_config 1 · cash_forecast_settings 1 ·
  ob_register_audit_events 1 (append-only)

driver_finance:
  driver_pay_rates 91 · driver_advance_accounts 12 (HOLD -- reported) ·
  settlement_payment_events 3 (append-only) · escrow_balances 3 (HOLD -- reported) ·
  escrow_settings 1 · auto_deduction_policies 1 · settlement_contract_terms_config 1

banking:
  bank_transactions 395 (owner's explicit exception) · bank_accounts 5 ·
  transaction_categories 4 · intercompany_entity_pairs 2

factoring:
  customer_factor_assignment 1221 · factor 1 (Faro Factoring, real partner)

dispatch:
  (every table alphabetically before stop_arrivals reads 0)
  stop_arrivals 1 (append-only, driver = the known sample driver 9f35cf21)

fuel:
  fuel_card_overage_policies 1 · fuel_planner_settings 1

telematics (not purged -- GPS history, not a transaction, per PART 2):
  vehicle_locations 40877 · vehicle_driver_assignments 55
```

**Every row still present is accounted for**: PART-2 keep-list config, the 3 explicitly-HOLD
"report don't guess" rows (reported in #19775), or one of the 6 hard append-only-blocked rows
across the whole purge (`accounting.escrow_postings` 6, `accounting.ob_register_audit_events` 1,
`accounting.period_cash_basis_snapshot` 1, `driver_finance.settlement_payment_events` 3,
`dispatch.stop_arrivals` 1 — 12 rows total). None is an unexplained leftover.

**dispatch.load_id_reservations and lib.trace_counters**: reservations were already cleared by a
concurrent seat before this pass reached that schema (see #19783); the LOAD counter's reseed value
was deliberately NOT set here — the two source documents disagree (13556 vs 13509) and neither
matches the live, actively-moving counter (13523 and climbing at the time this was checked).
Flagged for whoever closes that specific piece last, against live state at that moment.

## What GO-26 shipped, across all six PRs

| # | PR | Schema | Real cross-schema issue found + fixed |
|---|---|---|---|
| 1 | #19774 | accounting | — |
| 2 | #19777 | driver_finance | safety.civil_fines FK to a test fixture, cleared (safety out of scope) |
| 3 | #19780 | banking | 148 REAL kept bank_transactions wrongly reconciled against a fixture session — fixed correctly |
| 4 | #19781 | factoring | Verified $30k+ "real-looking" batches were orphaned refs to already-purged fixture invoices before deleting |
| 5 | #19783 | dispatch | Caught concurrent-seat activity live, did not double-purge or guess a stale reseed value |
| 6 | this PR | fuel | — |
