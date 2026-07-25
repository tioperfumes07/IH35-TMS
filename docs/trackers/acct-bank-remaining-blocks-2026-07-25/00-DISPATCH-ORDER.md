# Recommended dispatch order (post-purge remaining)

## Wave O — OWNER-GATE (no code until Jorge writes)

- `ACCT-R-28` `0091-d1-2` — 0091 d1 2
- `ACCT-R-29` `0251-gap2-vendor-gl-linkage` — 0251 gap2 vendor gl linkage
- `ACCT-R-30` `0251-gap3-vendor-invoice-linkage` — 0251 gap3 vendor invoice linkage
- `ACCT-R-31` `0473-1-1-default-revenue-account-unmapped-line` — 0473 1 1 default revenue account unmapped line
- `ACCT-R-32` `0473-1-6-wo-void-reversal-grain` — 0473 1 6 wo void reversal grain
- `ACCT-R-33` `0473-1-8-tk-transp-lease-asc842` — 0473 1 8 tk transp lease asc842
- `ACCT-R-34` `0519-at2-no-db-enforced-sod` — 0519 at2 no db enforced sod
- `ACCT-R-35` `AF-1-entity-coa-fix` — AF 1 entity coa fix
- `ACCT-R-36` `AF-4-ap-bills-migration` — AF 4 ap bills migration
- `ACCT-R-37` `CHAIN-04-bill-payment-tieout` — CHAIN 04 bill payment tieout
- `ACCT-R-38` `CHAIN-06-invoice-ar-chain-proof` — CHAIN 06 invoice ar chain proof
- `ACCT-R-39` `dip-mor-pre-post-petition-ap-split` — dip mor pre post petition ap split
- `ACCT-R-40` `factoring-asc860-cpa-control-test-open` — factoring asc860 cpa control test open
- `ACCT-R-41` `flow2-customer-chargeback-driver-expense` — flow2 customer chargeback driver expense
- `ACCT-R-42` `ifta-sales-tax-booking-location-confirm` — ifta sales tax booking location confirm
- `ACCT-R-43` `usmca-unhide-entity-switcher` — usmca unhide entity switcher
- `BANK-R-02` `CONN-3-relay-internal-bank` — CONN 3 relay internal bank
- `BANK-R-03` `phase13-audit216-banking-industry` — phase13 audit216 banking industry
- `BANK-R-04` `sweepfix1727-8` — sweepfix1727 8

## Wave F — FINANCIAL-HOLD (Cursor HOLD PRs, one finding each)

- `ACCT-R-01` `0007-pattern-5-split-brain-engines` — 0007 pattern 5 split brain engines
- `ACCT-R-03` `0091-m-lists-2` — 'Merge accounts' does not merge — handleMerge (CoaBatchActions
- `ACCT-R-05` `0251-gap11-commodity-gl` — The product catalog (0251-gap10) that would key GL account selection off commodi
- `ACCT-R-06` `0251-gap8-accessorials-gl_VERIFY` — catalogs
- `ACCT-R-07` `0280-42-wo-to-expense-flow` — WO status-count widget has no join to accounting
- `ACCT-R-08` `0441-mod13-inventory-accounting-none_DESIGN` — parts-inventory has no FK/write path to accounting
- `ACCT-R-11` `0441-mod8-tx-fields-captured-not-sent` — banking
- `ACCT-R-12` `0519-es1-58-unscoped-tables` — No CI guard verifies that any of the 58 unscoped tables actually inherit scope v
- `ACCT-R-14` `audit4-tax-return-automation` — 1) The sales-tax return module (prepare/file/mark-paid) is built but never regis
- `ACCT-R-15` `audit7-cost-center-tracking` — A true cost-center dimension distinct from the locked unit/driver Class field, p
- `ACCT-R-16` `audit8-revenue-leakage-detection` — Revenue leakage detection + unbilled-revenue tracking/forecasting/variance views
- `ACCT-R-17` `audit9-expense-validation-duplicate-detection` — Duplicate-expense-entry detection + expense-policy-enforcement layer — confirmed
- `ACCT-R-18` `banking-b4-driver-vendor-account-mapping` — A driver-keyed default-account mapping column/table equivalent to mdata
- `ACCT-R-19` `db249-finance-schema-naming-drift` — The finance
- `ACCT-R-20` `db249-index-optimization-3` — 3 composite indexes as specified do not exist on any of the 3 tables; this is a 
- `ACCT-R-21` `fact-par-1-submission-workflow` — Only the manual_download channel is wired; no email-adapter or file-drop-adapter
- `ACCT-R-23` `flow3-cancellation-billing-deduction-linkage` — No cancellation_id FK column on accounting
- `ACCT-R-24` `flow6-auto-invoice-sending` — No automatic fire of the send/email path when an invoice leaves draft; no remind

## Wave N — NON-FINANCIAL

- `ACCT-R-04` `0243-g4-deploy-smoke-fixed-unit-test-owner` — IH35_SMOKE_UNIT_ID (and IH35_SMOKE_OPERATING_COMPANY_ID) are not set in render
- `ACCT-R-09` `0441-mod7-bill-subnav-filters-not-creators_UI` — Maintenance/Repair/Fuel/Driver bill subnav links route to a filtered list, not a
- `ACCT-R-10` `0441-mod7-myaccountant-flag-no-seed` — no seed migration for MY_ACCOUNTANT_ENABLED in db/migrations/ (consistent with o
- `ACCT-R-13` `audit2-internal-controls-approval-workflow` — settlements/approval
- `ACCT-R-22` `fh-unit-allocation-ui-view-missing` — No frontend page/route/api-client for the Unit-Allocation (FH-7) read-only view 
- `ACCT-R-25` `global-column-resize-sort-parity-table-phase-a` — The primitive itself is built and its own contract guard runs in CI (ci
- `ACCT-R-26` `h-05-home-kpi-no-date-range-toggle` — No 7d/30d/MTD/YTD date-range selector on the Home KPI row in either home page va
- `BANK-R-01` `qbo-parity-resizable-columns-everywhere` — Customers/Vendors/Drivers list pages (and most of the remaining 28-module catalo

## Wave D — DOCS

- `ACCT-R-02` `0033-audit-schema-manifest-tool` — The literal live-Neon-pull manifest generator (scripts/audit-schema
- `ACCT-R-27` `ledger-write-proof-operational-not-found` — apps/backend/src/accounting/__proofs__/core-ledger-write-proof
