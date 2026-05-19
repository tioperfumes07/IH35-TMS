# IH35 Accounting Backbone Spec

## 1) Current strategy

- QuickBooks (QBO) remains system of record short-term while IH35 builds internal accounting backbone incrementally.
- IH35 continues operational accounting sync to/from QBO (master-data mirror/projection plus outbound transaction queueing).
- Internal ledger capability is built in phases, with posting controls and close controls before broad report expansion.
- No UI redesign is part of this spec; current production UI remains design authority.

## 2) Out of scope now

- No feature code in this PR.
- No UI redesign.
- No production database writes.
- No migration edits.
- No ledger drilldown UI yet.
- No advanced reporting UI yet.
- No production cutover yet.
- No replacement of QuickBooks yet.

## 3) Verified Evidence Matrix (already exists)

| Item | Status | Exact file path(s) | Notes |
|---|---|---|---|
| Invoices | FOUND | `apps/frontend/src/App.tsx`, `apps/frontend/src/pages/accounting/InvoicesListPage.tsx`, `apps/frontend/src/api/accounting.ts`, `db/migrations/0060_p3_t11_20_1_accounting_invoices_schema.sql` | Route and full list/detail/create APIs exist. |
| Bills | FOUND | `apps/frontend/src/App.tsx`, `apps/frontend/src/pages/accounting/BillsPage.tsx`, `apps/frontend/src/api/accounting.ts`, `db/migrations/0090_p5_d2_bill_payment_balance.sql` | Bill list and payment-linked workflow exist. |
| Payments | FOUND | `apps/frontend/src/App.tsx`, `apps/frontend/src/pages/accounting/PaymentsListPage.tsx`, `apps/frontend/src/api/accounting.ts`, `db/migrations/0060_p3_t11_20_1_accounting_invoices_schema.sql` | Customer payments, apply/unapply, void APIs exist. |
| Vendors | FOUND | `apps/frontend/src/App.tsx`, `apps/frontend/src/pages/Vendors.tsx`, `apps/frontend/src/pages/VendorDetail.tsx`, `apps/frontend/src/api/mdata.ts` | Vendor profile, balances, transactions UI is implemented. |
| Customers | FOUND | `apps/frontend/src/App.tsx`, `apps/frontend/src/pages/Customers.tsx`, `apps/frontend/src/pages/CustomerDetail.tsx`, `apps/frontend/src/api/mdata.ts` | Customer profile, aging summary, transaction list implemented. |
| Chart of accounts | FOUND | `apps/frontend/src/App.tsx`, `apps/frontend/src/pages/lists/accounting/ChartOfAccountsListPage.tsx`, `apps/frontend/src/pages/lists/accounting/AccountingCatalogListPage.tsx` | Accounting list/catalog page exists and is routed. |
| Products/services | PARTIAL | `apps/frontend/src/App.tsx`, `apps/frontend/src/pages/lists/accounting/ItemsListPage.tsx` | Items catalog exists (with service/inventory typing), but no dedicated "Products & Services" module page. |
| Journal entries page | FOUND | `apps/frontend/src/App.tsx`, `apps/frontend/src/pages/accounting/ManualJEListPage.tsx`, `apps/backend/src/accounting/journal-entries.routes.ts`, `db/migrations/0092_p5_d4_manual_journal_entries.sql` | Manual JE list/create/void and posting lines are implemented. |
| Settlements | FOUND | `apps/frontend/src/App.tsx`, `apps/frontend/src/pages/driver-finance/SettlementsPage.tsx`, `apps/backend/src/driver-finance/settlements-mvp.routes.ts` | Driver settlements workflow exists. |
| Pre-settlements | FOUND | `apps/frontend/src/App.tsx`, `apps/frontend/src/pages/accounting/AccountingPreSettlementsPage.tsx`, `apps/frontend/src/components/driver-finance/PreSettlementsPanel.tsx` | Accounting pre-settlements route reuses shared panel. |
| QBO mirror/projection | FOUND | `db/migrations/0142_mdata_qbo_master_data_tables.sql`, `db/migrations/0193_qbo_master_data_projection_links.sql`, `db/migrations/0193a_qbo_vendor_customer_nonpartial_unique.sql`, `db/migrations/0194_qbo_master_data_projection_transp.sql` | Master-data mirror and projection chain exists in migrations. |
| Combobox foundation | FOUND | `apps/frontend/src/components/shared/Combobox.tsx`, `apps/frontend/src/components/shared/SelectCombobox.tsx`, `apps/frontend/src/components/forms/QboCombobox.tsx` | Reusable searchable combobox foundation is present. |
| Accounting tables | FOUND | `apps/frontend/src/components/DataTable.tsx`, `apps/frontend/src/pages/accounting/InvoicesListPage.tsx`, `apps/frontend/src/pages/accounting/BillPaymentsListPage.tsx` | Shared table component and accounting grid/table usage exist. |
| Attachments backend | FOUND | `apps/backend/src/documents/attachments.routes.ts`, `apps/backend/src/documents/attachments.service.ts`, `apps/frontend/src/components/documents/DocumentsTab.tsx`, `apps/frontend/src/components/documents/UploadModal.tsx` | Multi-entity attachment upload/list/download/delete routes exist. |

## 4) What is missing for full accounting (repo-based)

- General ledger: PARTIAL
  - Evidence: JE + postings exist (`db/migrations/0092_p5_d4_manual_journal_entries.sql`) and trial-balance endpoint exists (`apps/backend/src/accounting/p7-wave2.routes.ts`).
  - Gap: No dedicated GL transaction-source model and no canonical GL balance/materialized view layer.
- Journal entry lines: PARTIAL
  - Evidence: `accounting.journal_entry_postings` exists (`db/migrations/0092_p5_d4_manual_journal_entries.sql`).
  - Gap: Requested canonical `journal_entry_lines` object name not present; no source-link rows to operational transactions.
- Posting engine: PARTIAL
  - Evidence: individual accounting entities and QBO outbound translators exist (`apps/backend/src/integrations/qbo/sync-outbound-accounting.entities.ts`).
  - Gap: no centralized posting batch/orchestrator for deterministic, idempotent internal ledger postings across all sources.
- Transaction source registry: NOT FOUND IN REPO
- A/R aging: FOUND
  - Evidence: route + page + report API (`apps/frontend/src/App.tsx`, `apps/frontend/src/pages/reports/ARAgingPage.tsx`, `db/migrations/0123_p6_pre_ledger_drift_reconciliation.sql` has `views.ar_aging`).
- A/P aging: PARTIAL
  - Evidence: route + UI report (`apps/frontend/src/App.tsx`, `apps/frontend/src/pages/reports/APAgingPage.tsx`).
  - Gap: no clear `views.ap_aging` evidence in migrations.
- Financial statements: PARTIAL
  - Evidence: trial-balance endpoint exists (`apps/backend/src/accounting/p7-wave2.routes.ts`).
  - Gap: no complete balance sheet / P&L / cash flow statement backbone tied to close and posting controls.
- Bank reconciliation: FOUND
  - Evidence: sessions + routes + workflow (`db/migrations/0075_p5_t1_1_banking_reconciliation_sessions.sql`, `apps/backend/src/banking/reconciliation.routes.ts`).
- Accounting periods: FOUND
  - Evidence: `accounting.periods` and close guards (`db/migrations/0183_p7_w2_accounting_periods_close.sql`).
- Period close: PARTIAL
  - Evidence: close/reopen routes and retained earnings helper exist (`apps/backend/src/accounting/p7-wave2.routes.ts`, `apps/backend/src/accounting/period-close-retained-earnings.service.ts`).
  - Gap: broader close checklist/control surface still limited.
- Audit trail: PARTIAL
  - Evidence: `appendCrudAudit` used broadly (for example `apps/backend/src/accounting/p7-wave2.routes.ts`).
  - Gap: no dedicated accounting-only immutable audit ledger table with explicit posting lineage.
- QBO sync conflict handling: FOUND
  - Evidence: conflict APIs and queue retry/dead-letter controls (`apps/backend/src/accounting/p7-wave2.routes.ts`, `apps/backend/src/integrations/qbo/qbo-sync.service.ts`).
- Settlement accounting: PARTIAL
  - Evidence: settlement workflows exist (`apps/frontend/src/pages/driver-finance/SettlementsPage.tsx`) and queue includes settlement entity (`apps/backend/src/integrations/qbo/qbo-sync.service.ts`).
  - Gap: internal settlement-to-ledger posting model is not fully formalized as a GL source.
- Escrow/debt ledger: PARTIAL
  - Evidence: settlement UI indicates debt/holds fields (`apps/frontend/src/pages/driver-finance/SettlementsPage.tsx`).
  - Gap: explicit accounting escrow/debt ledger tables and posting links are not clearly present.
- Factoring accounting: PARTIAL
  - Evidence: factoring flows and QBO translators exist (`apps/frontend/src/pages/accounting/FactoringListPage.tsx`, `apps/frontend/src/api/accounting.ts`, `apps/backend/src/integrations/qbo/sync-outbound-accounting.entities.ts`).
  - Gap: fully normalized internal factoring sub-ledger and reserve lifecycle postings are not explicit as standalone backbone objects.
- Fuel expense posting: PARTIAL
  - Evidence: expense translator exists (`apps/backend/src/integrations/qbo/sync-outbound-accounting.entities.ts`).
  - Gap: explicit deterministic posting rules from fuel operational events to internal ledger are not codified as a source registry.
- Maintenance A/P posting: PARTIAL
  - Evidence: bills and maintenance modules exist (`apps/frontend/src/pages/accounting/BillsPage.tsx`, `apps/frontend/src/pages/maintenance/MaintenanceHome.tsx`).
  - Gap: explicit maintenance work-order to AP posting registry and control pipeline not fully formalized.

## 5) Proposed database backbone (target objects and current mapping)

| Target object | Purpose | Current repo status |
|---|---|---|
| `accounting_periods` | Canonical period calendar and lock/close control | PARTIAL: equivalent exists as `accounting.periods` in `db/migrations/0183_p7_w2_accounting_periods_close.sql`. |
| `journal_entries` | Header-level accounting entries | FOUND as `accounting.journal_entries` in `db/migrations/0092_p5_d4_manual_journal_entries.sql`. |
| `journal_entry_lines` | Debit/credit line rows | PARTIAL: equivalent exists as `accounting.journal_entry_postings`; canonical naming + source-link fields should be standardized. |
| `posting_batches` | Idempotent posting run units and replay boundaries | NOT FOUND IN REPO. |
| `transaction_source_links` | Traceability from operational transaction to posting lines | NOT FOUND IN REPO. |
| `account_balances_view` | Ledger-backed balances per account/period | NOT FOUND IN REPO. |
| `trial_balance_view` | Ledger-backed trial balance read model | PARTIAL: route computes trial balance (`apps/backend/src/accounting/p7-wave2.routes.ts`) but no dedicated DB view detected. |
| `ar_open_items` | AR open-item basis for aging/statements | PARTIAL: `views.ar_aging` exists in `db/migrations/0123_p6_pre_ledger_drift_reconciliation.sql`, but no canonical `ar_open_items` table/view found. |
| `ap_open_items` | AP open-item basis for aging/statements | NOT FOUND IN REPO (canonical object name). |
| `reconciliation_sessions` | Reconciliation period/session state | FOUND as `banking.reconciliation_sessions` in `db/migrations/0075_p5_t1_1_banking_reconciliation_sessions.sql`. |
| `reconciliation_lines` | Explicit reconciled/unreconciled line state | PARTIAL: matching fields exist on `banking.bank_transactions` (`db/migrations/0182_p7_w2_bank_transactions_review.sql`) but no standalone lines table. |
| `accounting_audit_events` | Immutable accounting-specific audit event store | NOT FOUND IN REPO (dedicated table); generic audit append exists in services/routes. |
| `qbo_sync_events` | Structured sync event history and outcomes | PARTIAL: queue/conflicts/alerts exist (`integrations.qbo_sync_queue`, `integrations.qbo_sync_conflicts`, `qbo.sync_alerts`) but no single canonical `qbo_sync_events` object. |

## 6) Posting rules (double-entry baseline)

- Invoice
  - Dr `Accounts Receivable`
  - Cr `Revenue` (line-type mapped; tax/other components split where applicable)
- Customer payment
  - Dr `Cash/Undeposited Funds`
  - Cr `Accounts Receivable`
- Bill
  - Dr `Expense` or `COGS` (mapped from bill line/category)
  - Cr `Accounts Payable`
- Bill payment
  - Dr `Accounts Payable`
  - Cr `Cash/Bank`
- Expense
  - Dr `Expense` (or asset/prepaid where configured)
  - Cr `Cash/Bank` or `Credit Card Liability`
- Driver settlement
  - Dr `Driver Compensation Expense`
  - Cr `Settlement Payable` (then payable clearing on pay event)
- Fuel purchase
  - Dr `Fuel Expense`
  - Cr `Cash/Bank` or `Fuel Card Liability`
- Maintenance bill
  - Dr `Maintenance Expense` (or inventory/asset account by policy)
  - Cr `Accounts Payable`
- Factoring advance
  - Dr `Cash`
  - Cr `Factoring Liability`
- Factoring fee
  - Dr `Factoring Fee Expense`
  - Cr `Cash` or `Factoring Liability` (depending on settlement flow)
- Factoring reserve release
  - Dr `Factoring Liability`
  - Cr `Cash`
- Journal entry reversal
  - Auto-create reversing entry with mirrored lines and reference to original entry id.

## 7) Transaction lifecycle

- Draft -> Approved -> Posted -> Synced -> Reconciled -> Closed
- Controls:
  - Draft/Approved must block accounting impact until `Posted`.
  - Posted records become append-only except explicit reversal/void with audit.
  - Synced state tracks QBO queue status and payload hash for idempotency.
  - Reconciled ties transaction/balance state to reconciliation sessions.
  - Closed is period-guarded and blocked by close controls.

## 8) QBO ownership boundaries

| Area | Current system of record | IH35 responsibility now | QBO responsibility now | Future IH35 target |
|---|---|---|---|---|
| Chart of accounts | QBO + projected catalogs | Mirror/projection and internal catalog references (`db/migrations/0194_qbo_master_data_projection_transp.sql`) | Authoritative account hierarchy now | IH35-managed COA with controlled QBO sync-outs |
| Customers | QBO + IH35 customer records | Maintain operational customer profile and qbo link id (`0193`/`0194`) | Master customer financial identity now | IH35 canonical customer master with sync conflict policy |
| Vendors | QBO + IH35 vendor records | Maintain operational vendor profile and qbo link id (`0193`/`0194`) | Master vendor financial identity now | IH35 canonical vendor master with governed sync |
| Products/services | QBO item master projected to catalogs.items | Use projected item refs in IH35 workflows (`0194`) | Authoritative item taxonomy now | IH35 item governance + optional push |
| Invoices | IH35 operations + QBO sync | Create/update invoice data and queue outbound sync (`apps/backend/src/integrations/qbo/sync-outbound-accounting.entities.ts`) | Receives synced invoice for short-term accounting SoR | IH35-ledger primary, QBO optional/reporting sync |
| Bills | IH35 operations + QBO sync | Bill workflow and outbound sync translators | Receives synced AP docs short-term | IH35 AP backbone primary |
| Payments | IH35 operations + QBO sync | Payment/apply/unapply + queue handling | Receives synced payment state short-term | IH35 AR cash application primary |
| Journal entries | IH35 manual/auto JE + QBO push | JE create/void + push queue (`apps/backend/src/accounting/journal-entries.routes.ts`) | Receives JE now | IH35 JE/GL primary with optional QBO mirror |
| Bank transactions | IH35 banking + QBO purchase sync | Reconciliation, matching, queue/retry/dead-letter | Receives mapped purchase transactions where configured | IH35 reconciliation/ledger authoritative |
| Settlements | IH35 driver-finance workflow | Settlement operational lifecycle and queued sync intent | Limited/manual downstream handling | IH35 settlement sub-ledger + deterministic posting |
| Expenses | IH35 expense capture + QBO purchase sync | Expense capture and outbound mapping | Receives purchase docs | IH35 expense posting primary with optional export |

### Conflict rules (current + target)

- Current:
  - Conflict rows resolved via `qbo_wins` / `tms_wins` / `manual_merge` / `dismissed` (`apps/backend/src/accounting/p7-wave2.routes.ts`).
  - `tms_wins` can enqueue resync to QBO queue.
- Target:
  - Enforce per-entity ownership rule; reject conflicting writes outside owner.
  - Maintain deterministic replay via payload hash + version checks.

### Retry/error queue

- Existing queue behavior includes pending/in_flight/failed/blocked/dead_letter, backoff, retries, and dead-letter alerting (`apps/backend/src/integrations/qbo/qbo-sync.service.ts`).
- Target additions: explicit operational runbooks + SLO + replay constraints by posting-batch id.

## 9) Dependency order with minimum acceptance criteria

### Phase 0 - Data/migration confirmation
- Minimum acceptance criteria:
  - QBO mirror/projection migrations are present and stable (`0142`, `0193`, `0193a`, `0194`).
  - Route and API inventory for accounting modules is documented and verified.
  - No undocumented schema drift in core accounting tables.

### Phase 1 - Ledger schema
- Minimum acceptance criteria:
  - Canonical JE header/line model finalized (`journal_entries`, `journal_entry_lines` naming reconciliation plan).
  - `posting_batches` and `transaction_source_links` schema designed and approved.
  - Closed-period enforcement compatibility validated with existing `accounting.periods`.

### Phase 2 - Posting engine
- Minimum acceptance criteria:
  - Idempotent posting service exists with payload hash/version checks.
  - Backfill-safe, replay-safe posting batches.
  - Audit events include posting batch id and source transaction id.

### Phase 3 - AR/AP posting
- Minimum acceptance criteria:
  - Invoice/payment/bill/bill-payment postings generated and balanced automatically.
  - Open-item views (`ar_open_items`, `ap_open_items`) available and testable.
  - Reversal/void rules produce deterministic compensating entries.

### Phase 4 - Settlements/escrow/debt
- Minimum acceptance criteria:
  - Settlement events mapped to accounting postings with debt/escrow dimensions.
  - Holds/disputes reflected in posting eligibility state.
  - No silent mutation of posted balances.

### Phase 5 - Banking/reconciliation
- Minimum acceptance criteria:
  - Reconciliation lines are formally linked to posted accounting transactions.
  - Reconcile-complete enforces variance controls and audit evidence.
  - Bank-to-ledger tie-out query is deterministic.

### Phase 6 - Factoring/fuel/maintenance
- Minimum acceptance criteria:
  - Factoring advance/fee/release posting templates implemented.
  - Fuel and maintenance operational events map to deterministic AP/expense postings.
  - Cross-module posting source links are queryable.

### Phase 7 - Financial reports
- Minimum acceptance criteria:
  - Trial balance from canonical view (not route-only aggregation).
  - Balance sheet/P&L/cash flow data contracts defined and validated.
  - AR/AP aging read from open-item backbone.

### Phase 8 - Period close/audit hardening
- Minimum acceptance criteria:
  - Close checklist gates posting, sync, and edits across closed periods.
  - Reopen requires owner-level audit reason and creates audit artifact.
  - Accounting audit event coverage is complete for create/update/void/reverse/sync/reconcile/close.

## 10) Honest task count (realistic implementation blocks)

- Small (10 blocks)
  - Naming normalization, contract shims, guard scripts, doc/runbook additions.
- Medium (12 blocks)
  - Open-item views, posting templates per transaction family, source-link API/read models.
- Large (9 blocks)
  - Core posting engine, reconciliation line integration, settlement/escrow/debt accounting model.
- Project-sized (4 blocks)
  - End-to-end financial statement backbone, period close hardening, migration/backfill program, operational cutover controls.

Estimated total: 35 implementation blocks (excluding this spec PR).

## 11) Risk register

| Risk | Current exposure | Mitigation |
|---|---|---|
| Double posting | Multi-path writes and queue retries can duplicate financial impact if not guarded | Enforce `posting_batches` idempotency key + unique source-link constraints. |
| Missing idempotency | Some flows are event-driven without canonical posting batch registry | Require payload hash + source version check before posting commit. |
| Wrong QBO mapping | Translator mapping relies on qbo ids and fallbacks | Add strict mapping validation + fail-fast unresolved mapping policy. |
| Period-close bypass | Partial close controls exist, but not all posting paths are tied to close contract | Route all posting entry points through close guard service; CI guard for closed-period write checks. |
| Reconciliation drift | Bank matching can drift from posting basis if not line-linked | Introduce explicit reconciliation line object tied to posted transaction ids. |
| Editing posted transactions | Existing operational tables permit updates in some paths | Enforce append-only post state; only void/reversal allowed with audit reason. |
| Fake balances | Derived balances can diverge without canonical balance view | Publish ledger-backed `account_balances_view` and tie reports to it only. |
| Duplicate vendor/customer records | Dual-source master data can create duplicates | Enforce qbo link uniqueness and merge workflow before posting impact. |
| Failed sync retries | Dead-letter exists but operational remediation may be inconsistent | Define queue SLO + runbook + ownership with retry/dismiss policies. |
| Incomplete audit trail | Generic audit exists, but no dedicated accounting event schema | Introduce `accounting_audit_events` contract with required fields per action. |

## 12) Next 3 implementation PRs only

### PR 1 - Canonical posting backbone schema
- Branch: `feat/accounting-posting-backbone-schema`
- Scope:
  - Add canonical schema objects: `posting_batches`, `transaction_source_links`, and canonical aliases/mapping for `journal_entry_lines`.
  - Add verification guard for source-link uniqueness and idempotency keys.
- Why first:
  - Enables deterministic posting and safe replay before any behavior expansion.
- Suggested guard:
  - `verify:accounting-posting-backbone-contract`

### PR 2 - Posting engine MVP (invoice/bill/payment/bill-payment)
- Branch: `feat/accounting-posting-engine-mvp`
- Scope:
  - Implement centralized posting service for four highest-volume transaction types.
  - Generate balanced JE lines through one engine path and persist source links.
- Why second:
  - Converts existing operational accounting flows into deterministic ledger impact.
- Suggested guard:
  - `verify:accounting-posting-idempotency`

### PR 3 - Open-item + trial-balance canonical views
- Branch: `feat/accounting-open-items-and-trial-balance-views`
- Scope:
  - Add canonical `ar_open_items`, `ap_open_items`, and `trial_balance_view` DB objects.
  - Wire reports to canonical views and add correctness checks.
- Why third:
  - Stabilizes financial reads only after postings become deterministic.
- Suggested guard:
  - `verify:accounting-read-models`

