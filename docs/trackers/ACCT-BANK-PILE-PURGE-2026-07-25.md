# ACCT+BANK pile purge — 2026-07-25

**Scope:** `module` ∈ {accounting, banking} rows in `GAP|NEEDS-OWNER|NEEDS-PROD|UNVERIFIED` only. Other modules untouched.
**Law:** scoreboard `docs/module-completion/{accounting,banking}.json` remains canonical for module COMPLETE; pile is backlog overlay.

## Result
| | Accounting | Banking |
|---|---:|---:|
| Pending before | 61 | 19 |
| Pending after | 43 | 4 |
| **Purged** | **18** | **15** |

Changed rows: **33**. By verdict: {'BUILT': 11, 'NOISE': 8, 'WRONG_MODULE': 8, 'STALE_MAP_SCOREBOARD': 6}.

Global pile totals after: `{"BUILT": 733, "GAP": 259, "NEEDS-OWNER": 104, "NEEDS-PROD": 24, "NOISE": 61, "UNVERIFIED": 10}`.

## What we purged (and why)

| block_id | was → now | verdict |
|---|---|---|
| `0091-h3-3` | GAP → **BUILT** | BUILT |
| `0242-no-auto-customer-charge-on-cancellation` | NEEDS-OWNER → **NOISE** | NOISE |
| `0242-no-auto-equipment-log-on-transfer` | GAP → **NOISE** | WRONG_MODULE |
| `0251-gap22-lumper-expense_VERIFY` | GAP → **NOISE** | STALE_MAP_SCOREBOARD → `ACCT-ECON-04` |
| `0285-banking-transfer-gl-gap_VERIFY` | GAP → **NOISE** | STALE_MAP_SCOREBOARD → `BANK-ECON-03` |
| `0441-mod10-cashflow-accounting-routes-dead` | GAP → **BUILT** | BUILT |
| `0441-mod2-wo-split-brain` | GAP → **NOISE** | WRONG_MODULE |
| `0441-mod4-dispatch-settings-localstorage-only` | GAP → **NOISE** | WRONG_MODULE |
| `0441-mod6-hos-violations-source-enum-mismatch` | GAP → **NOISE** | WRONG_MODULE |
| `0441-mod8-auto-match-button-dead` | GAP → **BUILT** | BUILT |
| `0441-mod8-plaid-sign-deposits-negative` | GAP → **BUILT** | BUILT |
| `0441-mod9-customer-taxonomy-mismatch` | GAP → **NOISE** | WRONG_MODULE |
| `0473-2-7-bank-transactions-uncategorized-plaid` | GAP → **NOISE** | STALE_MAP_SCOREBOARD → `BANK-ECON-02` |
| `0519-fl1-2649-bank-tx-uncategorized_DISPATCH` | GAP → **NOISE** | STALE_MAP_SCOREBOARD → `BANK-ECON-02` |
| `0519-ri1-689-orphan-fk-columns` | GAP → **BUILT** | BUILT |
| `BANK-18-KEYSTONE-CATEGORIZE-REGISTER` | GAP → **BUILT** | BUILT |
| `CONN-1-plaid-reconcile-commit` | GAP → **NOISE** | STALE_MAP_SCOREBOARD → `BANK-ECON-04` |
| `a-03-expenses-fullpage-form-not-list-drawer` | GAP → **BUILT** | BUILT |
| `a-05-bills-no-page-level-create-button` | GAP → **BUILT** | BUILT |
| `accounting-2-ap-aging-qbo-mirror-population` | GAP → **BUILT** | BUILT |
| `audit5-fraud-anomaly-detection` | GAP → **BUILT** | BUILT |
| `banking-grid-sort-resize-rows-per-page` | GAP → **NOISE** | WRONG_MODULE |
| `biz-flow-6-no-automatic-invoice-sending` | GAP → **NOISE** | NOISE |
| `biz-flow-8-no-equipment-log-auto-update` | GAP → **NOISE** | NOISE |
| `dispatch-sweep-gap-21` | GAP → **NOISE** | WRONG_MODULE |
| `driverprofile-1-companion-tier1-rls-hardening` | GAP → **NOISE** | WRONG_MODULE |
| `expenses-list-routing-bug` | GAP → **NOISE** | NOISE |
| `fk-equipment-transfer-log-0289` | GAP → **NOISE** | NOISE |
| `flow3-cancellation-auto-customer-charge` | GAP → **NOISE** | NOISE |
| `flow6-auto-payment-application` | GAP → **NOISE** | STALE_MAP_SCOREBOARD → `ACCT-ECON-03` |
| `flow8-equipment-transfer-notifications` | GAP → **NOISE** | NOISE |
| `flow8-no-auto-equipment-log-notify` | GAP → **NOISE** | NOISE |
| `ps-a-item-editor-account-pickers-no-addnew` | GAP → **BUILT** | BUILT |

## Remaining pending (keep)
### accounting (43)
- `GAP` `0007-pattern-5-split-brain-engines`
- `GAP` `0033-audit-schema-manifest-tool`
- `GAP` `0091-m-lists-2`
- `GAP` `0243-g4-deploy-smoke-fixed-unit-test-owner`
- `GAP` `0251-gap11-commodity-gl`
- `GAP` `0251-gap8-accessorials-gl_VERIFY`
- `GAP` `0280-42-wo-to-expense-flow`
- `GAP` `0441-mod13-inventory-accounting-none_DESIGN`
- `GAP` `0441-mod7-bill-subnav-filters-not-creators_UI`
- `GAP` `0441-mod7-myaccountant-flag-no-seed`
- `GAP` `0441-mod8-tx-fields-captured-not-sent`
- `GAP` `0519-es1-58-unscoped-tables`
- `GAP` `audit2-internal-controls-approval-workflow`
- `GAP` `audit4-tax-return-automation`
- `GAP` `audit7-cost-center-tracking`
- `GAP` `audit8-revenue-leakage-detection`
- `GAP` `audit9-expense-validation-duplicate-detection`
- `GAP` `banking-b4-driver-vendor-account-mapping`
- `GAP` `db249-finance-schema-naming-drift`
- `GAP` `db249-index-optimization-3`
- `GAP` `fact-par-1-submission-workflow`
- `GAP` `fh-unit-allocation-ui-view-missing`
- `GAP` `flow3-cancellation-billing-deduction-linkage`
- `GAP` `flow6-auto-invoice-sending`
- `GAP` `global-column-resize-sort-parity-table-phase-a`
- `GAP` `h-05-home-kpi-no-date-range-toggle`
- `GAP` `ledger-write-proof-operational-not-found`
- `NEEDS-OWNER` `0091-d1-2`
- `NEEDS-OWNER` `0251-gap2-vendor-gl-linkage`
- `NEEDS-OWNER` `0251-gap3-vendor-invoice-linkage`
- `NEEDS-OWNER` `0473-1-1-default-revenue-account-unmapped-line`
- `NEEDS-OWNER` `0473-1-6-wo-void-reversal-grain`
- `NEEDS-OWNER` `0473-1-8-tk-transp-lease-asc842`
- `NEEDS-OWNER` `0519-at2-no-db-enforced-sod`
- `NEEDS-OWNER` `AF-1-entity-coa-fix`
- `NEEDS-OWNER` `AF-4-ap-bills-migration`
- `NEEDS-OWNER` `CHAIN-04-bill-payment-tieout`
- `NEEDS-OWNER` `CHAIN-06-invoice-ar-chain-proof`
- `NEEDS-OWNER` `dip-mor-pre-post-petition-ap-split`
- `NEEDS-OWNER` `factoring-asc860-cpa-control-test-open`
- `NEEDS-OWNER` `flow2-customer-chargeback-driver-expense`
- `NEEDS-OWNER` `ifta-sales-tax-booking-location-confirm`
- `NEEDS-OWNER` `usmca-unhide-entity-switcher`

### banking (4)
- `GAP` `qbo-parity-resizable-columns-everywhere`
- `NEEDS-OWNER` `CONN-3-relay-internal-bank`
- `NEEDS-OWNER` `phase13-audit216-banking-industry`
- `NEEDS-OWNER` `sweepfix1727-8`

## Next
- Do **not** re-dispatch purged NOISE/BUILT rows.
- Remaining GAP/NEEDS-OWNER still need real work or owner rulings — not pile theater.
- Module COMPLETE still = accounting **8/25** · banking **4/13** (unchanged by pile purge).
