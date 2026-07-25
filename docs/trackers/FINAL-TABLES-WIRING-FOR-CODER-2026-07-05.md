# FINAL — TABLES WIRING & RECONCILIATION FOR CODER
**IH35-TMS · 2026-07-05 · the definitive table cleanup plan — so the software can always identify each table's link, purpose, and post to the CORRECT table.**

> Plain text. Goal: every table has one clear home, correct links (FK), and no duplicate/ambiguous target. Fix these and whole classes of 'posted to the wrong table' bugs (customer black-hole, split-brain engines) disappear.

**Scope:** 531 tables / 74 schemas / 1251 FK edges (schema-verified from db/migrations). Cross-verified with the other coder's analysis (agree).

---
## ★ RECONCILIATION — WHAT TO FIX (grouped by problem type)

### A. SPLIT-BRAIN / DUPLICATE TABLES (same concept, ≥2 tables → software posts to the wrong one). **Pick ONE canonical, repoint writers, archive the rest.**
| Concept | Tables | Canonical / action |
|---|---|---|
| QBO customers | `mdata.qbo_customers` + `accounting.qbo_customers` | **mdata.qbo_* canonical** (lockdown §9.6); repoint accounting.qbo_* writers. *(This split caused the customer black-hole — create wrote qbo_customers, no picker read it.)* |
| QBO vendors | `mdata.qbo_vendors` + `accounting.qbo_vendors` | mdata.qbo_* canonical; repoint |
| QBO accounts | `mdata.qbo_accounts` + `accounting.qbo_accounts` | mdata.qbo_* canonical; repoint |
| `bank.*` schema | `bank.reconciliation_matches` | CANONICAL banking.* — retire bank.* |
| `maint.*` schema | `maint.part`, `maint.part_position_assignment`, `maint.pm_schedule`, `maint.position_history`, `maint.position_set` | CANONICAL maintenance.* — 5 stranded maint.* tables |
| `geo.*` schema | `geo.geofence_events`, `geo.geofence_state_transitions`, `geo.geofences` | DECISION (guard vs name mismatch — Jorge picks canonical) |
| `reporting.*` schema | `reporting.scheduled_report_runs`, `reporting.scheduled_reports` | DECISION: lockdown names reporting canonical but the live guard blocks it — Jorge picks |
| `payroll.*` schema | `payroll.driver_settlement_line_items`, `payroll.driver_settlements` | RETIRE payroll.* → driver_finance.* (settlement engine collapse, PR#2138) |
| `settlement.*` schema | `settlement.settlement`, `settlement.settlement_deduction`, `settlement.settlement_line` | RETIRE settlement.* → driver_finance.* |
| `finance.*` schema | `finance.loan_amortization_rows`, `finance.loans` | finance.loans = documented exception (keep); no other finance.* allowed |
| Vendors (4 disjoint) | `mdata.vendors` (AP truth) · `catalogs.maintenance_vendors` · `mdata.qbo_vendors` · `qbo_archive.*` | **mdata.vendors canonical**; write `maintenance_vendors.metadata.mdata_vendor_id` FK; stop WO picker writing qbo_vendors |
| Loads | `mdata.loads` (canonical) vs `dispatch.loads` | verify `dispatch.loads` — if a real 2nd table, consolidate to mdata.loads or clarify purpose |
| Cancellation reasons | `catalogs.cancellation_reasons` (legacy global) vs `catalogs.load_cancellation_reasons` (per-entity) | **OWNER RULING A, 2026-07-25: `catalogs.load_cancellation_reasons` is CANONICAL.** `catalogs.cancellation_reasons` is RETIRE — archived, never dropped (§F.24). This row previously named the LEGACY table as the target, contradicting `.cursor/rules/14`, skill §10(b) and `verify-canonical-table-writes.mjs`; that contradiction was LST-F17 and is now closed. (The superseded wording is intentionally not reproduced here — the guard below treats that phrasing as a live instruction wherever it appears.) Reason: `load_cancellation_reasons` is per-entity (`operating_company_id NOT NULL`, FORCE RLS, 12 active codes x 3 entities on prod) while `cancellation_reasons` is a single 9-row global with RLS OFF, and the whole catalog programme is per-entity. Enforced by `scripts/verify-steps/1359-verify-cancellation-canonical-direction.mjs`. |

### A.1 CATALOG SCOPING CLASSIFICATION — five classes, decided by prod VALUES + POLICY (not by the column)

**Added 2026-07-25 (LST-RLS-01 / packet block 14). All rows below are prod-verified on Neon
`br-fancy-credit-akjnd07a` with `SET app.bypass_rls='lucia'`; positive control `catalogs.accounts` = 1392
visible, so a 0 here is real absence, not RLS masking.**

Two wrong rules have already been written from partial evidence, and each would have caused a real defect:

1. *"`account_types`, `wo_cancellation_reasons`, `detail_types`, `tire_positions`, `journal_entry_types` are
   global reference taxonomies, RLS-off by design."* — **WRONG on three counts.** `detail_types` HAS
   `operating_company_id`; `journal_entry_types` and `tire_positions` have RLS **enabled AND forced**.
2. *"`companyScoped:false` iff the table has no `operating_company_id` column."* — **WRONG.** The column
   describes current state, not design intent. `payment_terms` and `posting_templates` also have no column,
   yet they are catalogs each entity should own — converting them is the whole point of packet blocks 04/05.
   And `detail_types` HAS the column while still requiring `companyScoped:false`.

The discriminator is the pair **(what the values are, what the policy says)** plus **design intent**:

| Class | Test | Tables (prod-verified 2026-07-25) | `companyScoped` |
|---|---|---|---|
| **A — global reference taxonomy, RLS OFF** | no `operating_company_id`; `relrowsecurity=false` | `account_types` (15 rows), `wo_cancellation_reasons` (6) | `false` |
| **B — global taxonomy, RLS forced but policy `qual:true`** | no opco; RLS forced; every policy unconditional | `journal_entry_types` (16) — `journal_entry_types_read`/`_write` both `true` | `false` |
| **C — global taxonomy, RLS forced with role-gated writes** | no opco; RLS forced; `global_read` true + Owner/Administrator writes | `tire_positions` (0 rows) | `false` |
| **D — SHARED CANONICAL** | HAS opco, **every row NULL**, read `opco IS NULL OR = GUC`, write `opco = GUC AND NOT is_system` | `detail_types` — 144 rows, **144 NULL, 0 non-null** | `false` — **scoping it reads 0 of 144** |
| **E — entity-blind DEFECT, conversion pending** | no opco but the catalog is business data each entity should own | `payment_terms`, `posting_templates`, `account_role_bindings` (has opco, 0 rows) → **blocks 05**; fleet catalogs → **block 04** | `false` **today**, `true` after the owner-gated conversion |

**Classified but deliberately NOT counted:** `wo_cancellation_reasons` (class A, 6 rows) has a mounted
read-only route (`apps/backend/src/catalogs/wo-cancellation-reasons.routes.ts`, registered in
`catalogs/index.ts`) and **zero frontend callers** — a dead surface, so it is absent from
`lists-module-count-spec.ts` and the hub does not count it. If it is ever wired to a picker it must
arrive as `companyScoped:false`. Recording this matters because an unexplained absence from the count
spec is indistinguishable from the LST-COUNT-01 undercount.

Genuinely per-entity catalogs (opco populated + FORCE RLS + GUC policy) are `companyScoped:true` — 52 of
them in `lists-module-count-spec.ts` today. `accounts` / `classes` / `items` are a deliberate sub-case: entity
correctness comes from FORCE RLS + the GUC rather than an explicit filter, so they stay `false`.

**Re-run to re-verify any row above:**
```sql
SET app.bypass_rls='lucia';
SELECT c.relname, c.relrowsecurity AS rls_on, c.relforcerowsecurity AS rls_forced,
       EXISTS(SELECT 1 FROM information_schema.columns col
              WHERE col.table_schema='catalogs' AND col.table_name=c.relname
                AND col.column_name='operating_company_id') AS has_opco
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='catalogs' AND c.relname IN
  ('account_types','wo_cancellation_reasons','journal_entry_types','tire_positions','detail_types');
-- Class D check — the one that matters, and the one the column alone cannot answer:
SELECT count(*) total, count(*) FILTER (WHERE operating_company_id IS NULL) opco_null
FROM catalogs.detail_types;                      -- 144 / 144
SELECT polname, pg_get_expr(polqual, polrelid) FROM pg_policy
WHERE polrelid='catalogs.detail_types'::regclass;  -- read: opco IS NULL OR = GUC ; write: = GUC AND NOT is_system
```

**Mis-filed finding, CLEARED:** an earlier audit flagged `account_types` and `wo_cancellation_reasons` as
"RLS OFF → cross-entity leak (P1)." There is nothing to leak *across entities* — neither table has an
`operating_company_id`, so no entity owns any row. That half of the finding is closed.
**What is NOT cleared:** with RLS off, write authorisation on those two tables rests entirely on the
`ih35_app` grant, where `tire_positions` (class C) restricts writes to Owner/Administrator. Making classes A
and B match class C is an additive owner-gated HELD migration, tracked under `LST-RLS-01`, not a doc fix.

**FK islands — decided, do not re-open:**

- `journal_entry_types` — the island is being closed by `202607960000_journal_entries_type_fk.sql`
  (ACCT-LINK-01, PR #3440). **MERGED IS NOT APPLIED:** verified on prod 2026-07-25 (lucia) the migration is
  **absent from `_system._schema_migrations`**, `accounting.journal_entries` still has **no** type column and
  **no** FK to `journal_entry_types`, and the prod ledger tail stops at `202607950000`. The island is still
  OPEN on prod until the owner applies it. Accounting lane — reported here, not touched.
- `detail_types` — **frozen owner decision (ACCT-02 / LINK-02): keep the text subtype lock. Do NOT wire an
  FK.** `catalogs.accounts` has no `detail_type_id` column and none is to be added.

**Enforcement:** `scripts/verify-steps/1358-verify-catalog-scoping-classification.mjs` pins this table to
`apps/backend/src/lists/lists-module-count-spec.ts`, so the doc and the code cannot drift apart — the exact
failure mode that produced the cancellation-reasons contradiction in §A.

### B. CROSS-SCHEMA NAME COLLISIONS (same table name in ≥2 schemas → ambiguous; review each — consolidate or rename for clarity)
- `assets` → `fixed_assets.assets`, `mdata.assets`
- `attachments` → `chat.attachments`, `documents.attachments`
- `driver_settlements` → `driver_finance.driver_settlements`, `payroll.driver_settlements`
- `dvir_submissions` → `maintenance.dvir_submissions`, `safety.dvir_submissions`
- `profile` → `alerts.profile`, `brokerupdate.profile`
- `queue` → `outbox.queue`, `sms.queue`, `whatsapp.queue`
- `scheduled_reports` → `reporting.scheduled_reports`, `reports.scheduled_reports`
- `settlement_disputes` → `driver_finance.settlement_disputes`, `settlements.settlement_disputes`
- `user_notification_preferences` → `identity.user_notification_preferences`, `notifications.user_notification_preferences`
- `workflow_requests` → `catalogs.workflow_requests`, `identity.workflow_requests`, `mdata.workflow_requests`

### C. UNWIRED ISLANDS — add the missing FK so the link is enforced (domain tables, no FK in or out)
| Table | What it is | Action |
|---|---|---|
| `accounting.line_category_load_required` | Double-entry GL / ledger — journal entries, bills, payments, posting, periods, CoA roles — line category load required | likely config — confirm & mark by-design |
| `alerts.broker_queue` | alerts — broker queue | add FK → broker/load if applicable |
| `dispatch.loads` | Dispatch operations — assignments, load assignment history, board state — loads | verify vs mdata.loads; consolidate or clarify |
| `integrity.anomalies` | integrity — anomalies | add FK → source entity |
| `maintenance.work_order_lines` | Fleet maintenance — work orders, service, parts, PM schedules — work order lines | add FK → maintenance.work_orders (parent) |
| `ops.program_board_notes` | Operational ops tooling — program board notes | add FK → block/board row |
| `qbo.reconciliation_alerts` | QuickBooks live sync state & mirror — reconciliation alerts | fix operating_company_id TEXT→uuid + FK org.companies |
| `reference.oem_parts` | Static reference data (codes, enums-as-tables) — oem parts | add FK or mark by-design |
| `safety.integrity_findings` | Safety & compliance events — incidents, accidents, fines (civil+internal), violations, drug/alcohol — integrity findings | add FK → the entity (driver/unit/load) |
| `utilization.driver_period` | utilization — driver period | add FK → mdata.drivers |
| `utilization.unit_period` | utilization — unit period | add FK → mdata.units |
| `compliance.form_2290_filings` | Regulatory filings — IFTA, 2290, IRP, permits, property-tax rendition, credentials — form 2290 filings | verify link (filing→vehicles/company; w8ben→driver) — add FK |
| `compliance.form_2290_filing_vehicles` | Regulatory filings — IFTA, 2290, IRP, permits, property-tax rendition, credentials — form 2290 filing vehicles | verify link (filing→vehicles/company; w8ben→driver) — add FK |
| `compliance.form_425c_reports` | Regulatory filings — IFTA, 2290, IRP, permits, property-tax rendition, credentials — form 425c reports | verify link (filing→vehicles/company; w8ben→driver) — add FK |
| `compliance.form_425c_exhibit_a_entries` | Regulatory filings — IFTA, 2290, IRP, permits, property-tax rendition, credentials — form 425c exhibit a entries | verify link (filing→vehicles/company; w8ben→driver) — add FK |
| `compliance.form_425c_exhibit_b_entries` | Regulatory filings — IFTA, 2290, IRP, permits, property-tax rendition, credentials — form 425c exhibit b entries | verify link (filing→vehicles/company; w8ben→driver) — add FK |
| `safety.driver_w8ben` | Safety & compliance events — incidents, accidents, fines (civil+internal), violations, drug/alcohol — driver w8ben | verify link (filing→vehicles/company; w8ben→driver) — add FK |

### D. WRONG-TYPE TENANT KEY — `operating_company_id` stored as TEXT (should be uuid + FK). Causes RLS/entity-scoping bugs & cross-tenant leaks.
- `accounting.recurring_bill_templates` → migrate TEXT → uuid + FK `org.companies` ⚠ FINANCIAL
- `dispatch.border_crossing_events` → migrate TEXT → uuid + FK `org.companies`
- `dispatch.driver_layovers` → migrate TEXT → uuid + FK `org.companies`
- `dispatch.stop_extra_rates` → migrate TEXT → uuid + FK `org.companies`
- `events.event_log` → migrate TEXT → uuid + FK `org.companies`
- `qbo.reconciliation_alerts` → migrate TEXT → uuid + FK `org.companies` ⚠ DEFAULT 'default' cross-tenant risk
- `reports.scheduled_subscriptions` → migrate TEXT → uuid + FK `org.companies`
- `safety.anomaly_alert_rules` → migrate TEXT → uuid + FK `org.companies`
- `safety.anomaly_alerts` → migrate TEXT → uuid + FK `org.companies`
- `safety.integrity_findings` → migrate TEXT → uuid + FK `org.companies`

### E. HUB TABLES (the backbone every write should connect back to — keep these clean)
- `org.companies` — Organization / companies (multi-entity) — companies · referenced by **385** tables
- `identity.users` — Auth & users — sessions, roles, permissions, preferences — users · referenced by **214** tables
- `mdata.drivers` — Operational master data — loads, stops, drivers, units, equipment, customers, vendors — drivers · referenced by **100** tables
- `mdata.units` — Operational master data — loads, stops, drivers, units, equipment, customers, vendors — units · referenced by **67** tables
- `mdata.loads` — Operational master data — loads, stops, drivers, units, equipment, customers, vendors — loads · referenced by **59** tables
- `catalogs.accounts` — Per-entity master catalogs — chart of accounts, items, classes, vendors/customers ref, role bindings — accounts · referenced by **26** tables
- `mdata.customers` — Operational master data — loads, stops, drivers, units, equipment, customers, vendors — customers · referenced by **25** tables
- `maintenance.work_orders` — Fleet maintenance — work orders, service, parts, PM schedules — work orders · referenced by **21** tables
- `mdata.vendors` — Operational master data — loads, stops, drivers, units, equipment, customers, vendors — vendors · referenced by **18** tables
- `accounting.journal_entries` — Double-entry GL / ledger — journal entries, bills, payments, posting, periods, CoA roles — journal entries · referenced by **17** tables
- `docs.files` — docs — files · referenced by **10** tables
- `mdata.equipment` — Operational master data — loads, stops, drivers, units, equipment, customers, vendors — equipment · referenced by **10** tables

---

## FULL TABLE INVENTORY (all 531 tables, by schema) — table · purpose · out→ · in← · verdict

### _system  (4)
- `_system.admin_jobs` — System — migration ledger, background jobs, admin jobs — admin jobs · out→2 in←0 · leaf · →identity.users, org.companies
- `_system.background_jobs` — System — migration ledger, background jobs, admin jobs — background jobs · out→0 in←0 · island(by-design)
- `_system.reconciliation_findings` — System — migration ledger, background jobs, admin jobs — reconciliation findings · out→1 in←0 · leaf · →org.companies
- `_system.reconciliation_state` — System — migration ledger, background jobs, admin jobs — reconciliation state · out→1 in←0 · leaf · →org.companies

### accounting  (64)
- `accounting.ar_collection_contacts` — Double-entry GL / ledger — journal entries, bills, payments, posting, periods, CoA roles — ar collection contacts · out→2 in←0 · leaf · →accounting.ar_collection_tasks, identity.users
- `accounting.ar_collection_tasks` — Double-entry GL / ledger — journal entries, bills, payments, posting, periods, CoA roles — ar collection tasks · out→4 in←1 · wired · →accounting.invoices, identity.users, mdata.customers, org.companies
- `accounting.banking_rules` — Double-entry GL / ledger — journal entries, bills, payments, posting, periods, CoA roles — banking rules · out→6 in←0 · leaf · →banking.bank_accounts, catalogs.accounts, catalogs.classes, identity.users, mdata.vendors, org.companies
- `accounting.bill_lines` — Double-entry GL / ledger — journal entries, bills, payments, posting, periods, CoA roles — bill lines · out→1 in←0 · leaf · →catalogs.accounts
- `accounting.bill_payments` — Double-entry GL / ledger — journal entries, bills, payments, posting, periods, CoA roles — bill payments · out→5 in←2 · wired · →accounting.bills, banking.bank_transactions, catalogs.accounts, identity.users, org.companies
- `accounting.bill_unit_allocation` — Double-entry GL / ledger — journal entries, bills, payments, posting, periods, CoA roles — bill unit allocation · out→3 in←0 · leaf · →accounting.bills, mdata.assets, org.companies
- `accounting.bills` — Double-entry GL / ledger — journal entries, bills, payments, posting, periods, CoA roles — bills · out→4 in←8 · wired · →identity.users, maintenance.work_orders, mdata.units, org.companies
- `accounting.cash_flow_adjustments` — Double-entry GL / ledger — journal entries, bills, payments, posting, periods, CoA roles — cash flow adjustments · out→2 in←0 · leaf · →identity.users, org.companies
- `accounting.cash_forecast_settings` — Double-entry GL / ledger — journal entries, bills, payments, posting, periods, CoA roles — cash forecast settings · out→1 in←0 · leaf · →identity.users
- `accounting.chart_of_accounts_roles` — Double-entry GL / ledger — journal entries, bills, payments, posting, periods, CoA roles — chart of accounts roles · out→3 in←0 · leaf · →catalogs.accounts, identity.users, org.companies
- `accounting.coa_account` — Double-entry GL / ledger — journal entries, bills, payments, posting, periods, CoA roles — coa account · out→1 in←2 · wired · →org.companies
- `accounting.credit_memos` — Double-entry GL / ledger — journal entries, bills, payments, posting, periods, CoA roles — credit memos · out→4 in←0 · leaf · →accounting.invoices, identity.users, mdata.customers, org.companies
- `accounting.customer_classifications` — Double-entry GL / ledger — journal entries, bills, payments, posting, periods, CoA roles — customer classifications · out→2 in←0 · leaf · →identity.users, mdata.customers
- `accounting.depreciation_schedule_rows` — Double-entry GL / ledger — journal entries, bills, payments, posting, periods, CoA roles — depreciation schedule rows · out→4 in←0 · leaf · →accounting.fixed_assets, accounting.journal_entries, identity.users, org.companies
- `accounting.escrow_accounts` — Double-entry GL / ledger — journal entries, bills, payments, posting, periods, CoA roles — escrow accounts · out→2 in←1 · wired · →catalogs.accounts, org.companies
- `accounting.escrow_postings` — Double-entry GL / ledger — journal entries, bills, payments, posting, periods, CoA roles — escrow postings · out→4 in←0 · leaf · →accounting.escrow_accounts, accounting.journal_entries, identity.users, org.companies
- `accounting.expense_category_account_map` — Double-entry GL / ledger — journal entries, bills, payments, posting, periods, CoA roles — expense category account map · out→3 in←0 · leaf · →catalogs.accounts, identity.users, org.companies
- `accounting.expense_lines` — Double-entry GL / ledger — journal entries, bills, payments, posting, periods, CoA roles — expense lines · out→4 in←0 · leaf · →accounting.expenses, catalogs.accounts, mdata.customers, mdata.loads
- `accounting.expenses` — Double-entry GL / ledger — journal entries, bills, payments, posting, periods, CoA roles — expenses · out→7 in←4 · wired · →accounting.journal_entries, identity.users, maintenance.work_orders, mdata.drivers, mdata.loads, mdata.units, org.companies
- `accounting.factoring_advances` — Double-entry GL / ledger — journal entries, bills, payments, posting, periods, CoA roles — factoring advances · out→3 in←2 · wired · →identity.users, mdata.vendors, org.companies
- `accounting.factoring_default_interest_accruals` — Double-entry GL / ledger — journal entries, bills, payments, posting, periods, CoA roles — factoring default interest accruals · out→1 in←0 · leaf · →accounting.factoring_advances
- `accounting.fixed_asset_classes` — Double-entry GL / ledger — journal entries, bills, payments, posting, periods, CoA roles — fixed asset classes · out→3 in←1 · wired · →catalogs.accounts, identity.users, org.companies
- `accounting.fixed_asset_disposals` — Double-entry GL / ledger — journal entries, bills, payments, posting, periods, CoA roles — fixed asset disposals · out→6 in←0 · leaf · →accounting.fixed_assets, accounting.journal_entries, accounting.lease_contract, catalogs.accounts, identity.users, org.companies
- `accounting.fixed_assets` — Double-entry GL / ledger — journal entries, bills, payments, posting, periods, CoA roles — fixed assets · out→6 in←3 · wired · →accounting.fixed_asset_classes, accounting.journal_entries, catalogs.accounts, identity.users, mdata.units, org.companies
- `accounting.invoice_lines` — Double-entry GL / ledger — journal entries, bills, payments, posting, periods, CoA roles — invoice lines · out→4 in←1 · wired · →accounting.invoices, catalogs.accounts, mdata.loads, org.companies
- `accounting.invoices` — Double-entry GL / ledger — journal entries, bills, payments, posting, periods, CoA roles — invoices · out→7 in←8 · wired · →accounting.factoring_advances, catalogs.payment_terms, factoring.factor, identity.users, mdata.customers, mdata.loads, org.companies
- `accounting.journal_entries` — Double-entry GL / ledger — journal entries, bills, payments, posting, periods, CoA roles — journal entries · out→2 in←17 · wired · →identity.users, org.companies
- `accounting.journal_entry_postings` — Double-entry GL / ledger — journal entries, bills, payments, posting, periods, CoA roles — journal entry postings · out→5 in←1 · wired · →accounting.journal_entries, accounting.posting_batches, catalogs.accounts, catalogs.classes, org.companies
- `accounting.lease_asset_line` — Double-entry GL / ledger — journal entries, bills, payments, posting, periods, CoA roles — lease asset line · out→5 in←0 · leaf · →accounting.fixed_assets, accounting.lease_contract, identity.users, mdata.units, org.companies
- `accounting.lease_classification` — Double-entry GL / ledger — journal entries, bills, payments, posting, periods, CoA roles — lease classification · out→3 in←0 · leaf · →accounting.lease_contract, identity.users, org.companies
- `accounting.lease_contract` — Double-entry GL / ledger — journal entries, bills, payments, posting, periods, CoA roles — lease contract · out→5 in←4 · wired · →accounting.journal_entries, identity.users, legal.contract_instances, mdata.customers, org.companies
- `accounting.lease_schedule_period` — Double-entry GL / ledger — journal entries, bills, payments, posting, periods, CoA roles — lease schedule period · out→4 in←0 · leaf · →accounting.journal_entries, accounting.lease_contract, identity.users, org.companies
- `accounting.line_category_load_required` — Double-entry GL / ledger — journal entries, bills, payments, posting, periods, CoA roles — line category load required · out→0 in←0 · ★ISLAND-VERIFY
- `accounting.outbox_events` — Double-entry GL / ledger — journal entries, bills, payments, posting, periods, CoA roles — outbox events · out→1 in←0 · leaf · →org.companies
- `accounting.payment_applications` — Double-entry GL / ledger — journal entries, bills, payments, posting, periods, CoA roles — payment applications · out→4 in←0 · leaf · →accounting.invoices, accounting.payments, identity.users, org.companies
- `accounting.payments` — Double-entry GL / ledger — journal entries, bills, payments, posting, periods, CoA roles — payments · out→4 in←3 · wired · →banking.bank_transactions, identity.users, mdata.customers, org.companies
- `accounting.period_cash_basis_snapshot` — Double-entry GL / ledger — journal entries, bills, payments, posting, periods, CoA roles — period cash basis snapshot · out→3 in←0 · leaf · →accounting.periods, identity.users, org.companies
- `accounting.periods` — Double-entry GL / ledger — journal entries, bills, payments, posting, periods, CoA roles — periods · out→3 in←1 · wired · →accounting.journal_entries, identity.users, org.companies
- `accounting.posting_batches` — Double-entry GL / ledger — journal entries, bills, payments, posting, periods, CoA roles — posting batches · out→2 in←1 · wired · →identity.users, org.companies
- `accounting.prepaid_amortization_rows` — Double-entry GL / ledger — journal entries, bills, payments, posting, periods, CoA roles — prepaid amortization rows · out→4 in←0 · leaf · →accounting.journal_entries, accounting.prepaid_assets, identity.users, org.companies
- `accounting.prepaid_assets` — Double-entry GL / ledger — journal entries, bills, payments, posting, periods, CoA roles — prepaid assets · out→4 in←1 · wired · →accounting.journal_entries, catalogs.accounts, identity.users, org.companies
- `accounting.ps_category` — Double-entry GL / ledger — journal entries, bills, payments, posting, periods, CoA roles — ps category · out→2 in←0 · leaf · →accounting.coa_account, org.companies
- `accounting.ps_item` — Double-entry GL / ledger — journal entries, bills, payments, posting, periods, CoA roles — ps item · out→2 in←0 · leaf · →accounting.coa_account, org.companies
- `accounting.pse_posting_policy` — Double-entry GL / ledger — journal entries, bills, payments, posting, periods, CoA roles — pse posting policy · out→1 in←0 · leaf · →org.companies
- `accounting.qbo_accounts` — Double-entry GL / ledger — journal entries, bills, payments, posting, periods, CoA roles — qbo accounts · out→0 in←0 · island(by-design)
- `accounting.qbo_customers` — Double-entry GL / ledger — journal entries, bills, payments, posting, periods, CoA roles — qbo customers · out→0 in←0 · island(by-design)
- `accounting.qbo_remote_count_collection_state` — Double-entry GL / ledger — journal entries, bills, payments, posting, periods, CoA roles — qbo remote count collection state · out→1 in←0 · leaf · →org.companies
- `accounting.qbo_remote_counts` — Double-entry GL / ledger — journal entries, bills, payments, posting, periods, CoA roles — qbo remote counts · out→1 in←0 · leaf · →org.companies
- `accounting.qbo_vendors` — Double-entry GL / ledger — journal entries, bills, payments, posting, periods, CoA roles — qbo vendors · out→0 in←0 · island(by-design)
- `accounting.recon_exceptions` — Double-entry GL / ledger — journal entries, bills, payments, posting, periods, CoA roles — recon exceptions · out→1 in←0 · leaf · →accounting.recon_runs
- `accounting.recon_runs` — Double-entry GL / ledger — journal entries, bills, payments, posting, periods, CoA roles — recon runs · out→0 in←1 · root/ref
- `accounting.recurring_bill_generation_log` — Double-entry GL / ledger — journal entries, bills, payments, posting, periods, CoA roles — recurring bill generation log · out→1 in←0 · leaf · →accounting.recurring_bill_templates
- `accounting.recurring_bill_templates` — Double-entry GL / ledger — journal entries, bills, payments, posting, periods, CoA roles — recurring bill templates · out→0 in←1 · root/ref
- `accounting.recurring_templates` — Double-entry GL / ledger — journal entries, bills, payments, posting, periods, CoA roles — recurring templates · out→2 in←0 · leaf · →identity.users, org.companies
- `accounting.revenue_contracts` — Double-entry GL / ledger — journal entries, bills, payments, posting, periods, CoA roles — revenue contracts · out→4 in←2 · wired · →accounting.invoices, catalogs.accounts, identity.users, org.companies
- `accounting.revenue_obligations` — Double-entry GL / ledger — journal entries, bills, payments, posting, periods, CoA roles — revenue obligations · out→4 in←1 · wired · →accounting.revenue_contracts, catalogs.accounts, identity.users, org.companies
- `accounting.revenue_recognition_rows` — Double-entry GL / ledger — journal entries, bills, payments, posting, periods, CoA roles — revenue recognition rows · out→5 in←0 · leaf · →accounting.journal_entries, accounting.revenue_contracts, accounting.revenue_obligations, identity.users, org.companies
- `accounting.sales_tax_agencies` — Double-entry GL / ledger — journal entries, bills, payments, posting, periods, CoA roles — sales tax agencies · out→3 in←1 · wired · →identity.users, mdata.vendors, org.companies
- `accounting.sales_tax_returns` — Double-entry GL / ledger — journal entries, bills, payments, posting, periods, CoA roles — sales tax returns · out→4 in←0 · leaf · →accounting.bills, accounting.sales_tax_agencies, identity.users, org.companies
- `accounting.settlement_posting_config` — Double-entry GL / ledger — journal entries, bills, payments, posting, periods, CoA roles — settlement posting config · out→2 in←0 · leaf · →identity.users, org.companies
- `accounting.transaction_source_links` — Double-entry GL / ledger — journal entries, bills, payments, posting, periods, CoA roles — transaction source links · out→2 in←0 · leaf · →accounting.journal_entry_postings, org.companies
- `accounting.vendor_classifications` — Double-entry GL / ledger — journal entries, bills, payments, posting, periods, CoA roles — vendor classifications · out→2 in←0 · leaf · →identity.users, mdata.vendors
- `accounting.vendor_credits` — Double-entry GL / ledger — journal entries, bills, payments, posting, periods, CoA roles — vendor credits · out→3 in←0 · leaf · →accounting.payments, identity.users, org.companies
- `accounting.vendor_subtype_pse_map` — Double-entry GL / ledger — journal entries, bills, payments, posting, periods, CoA roles — vendor subtype pse map · out→1 in←0 · leaf · →org.companies

### admin  (1)
- `admin.launch_toggles` — admin — launch toggles · out→2 in←0 · leaf · →identity.users, org.companies

### alerts  (3)
- `alerts.broker_queue` — alerts — broker queue · out→0 in←0 · ★ISLAND-VERIFY
- `alerts.profile` — alerts — profile · out→0 in←1 · root/ref
- `alerts.rule` — alerts — rule · out→2 in←0 · leaf · →alerts.profile, geofence.event

### analytics  (4)
- `analytics.customer_rollup` — analytics — customer rollup · out→0 in←0 · island(by-design)
- `analytics.lane_rollup` — analytics — lane rollup · out→0 in←0 · island(by-design)
- `analytics.load_fact` — analytics — load fact · out→0 in←0 · island(by-design)
- `analytics.type_rollup` — analytics — type rollup · out→0 in←0 · island(by-design)

### audit  (2)
- `audit.audit_events` — Audit trail — row_changes, hash chain (tamper-evident) — audit events · out→0 in←0 · island(by-design)
- `audit.row_changes` — Audit trail — row_changes, hash chain (tamper-evident) — row changes · out→0 in←0 · island(by-design)

### bank  (1)
- `bank.reconciliation_matches` — bank — reconciliation matches · out→3 in←0 · leaf · →banking.bank_transactions, identity.users, org.companies

### banking  (8)
- `banking.bank_accounts` — Bank feed — transactions, categorization, reconciliation, bank accounts — bank accounts · out→2 in←3 · wired · →catalogs.accounts, org.companies
- `banking.bank_transactions` — Bank feed — transactions, categorization, reconciliation, bank accounts — bank transactions · out→16 in←5 · wired · →accounting.bill_payments, accounting.bills, accounting.expenses, accounting.invoices, accounting.journal_entries, accounting.payments, banking.bank_accounts, banking.reconciliation_sessions, banking.transfers, catalogs.accounts, driver_finance.driver_settlements, driver_pay.settlements, mdata.drivers, mdata.loads, mdata.vendors, org.companies
- `banking.equipment_loan_attributions` — Bank feed — transactions, categorization, reconciliation, bank accounts — equipment loan attributions · out→4 in←0 · leaf · →banking.equipment_loans, identity.users, mdata.loads, org.companies
- `banking.equipment_loan_payments` — Bank feed — transactions, categorization, reconciliation, bank accounts — equipment loan payments · out→3 in←0 · leaf · →banking.equipment_loans, identity.users, org.companies
- `banking.equipment_loans` — Bank feed — transactions, categorization, reconciliation, bank accounts — equipment loans · out→4 in←2 · wired · →identity.users, mdata.equipment, mdata.vendors, org.companies
- `banking.reconciliation_sessions` — Bank feed — transactions, categorization, reconciliation, bank accounts — reconciliation sessions · out→3 in←1 · wired · →banking.bank_accounts, identity.users, org.companies
- `banking.transaction_categories` — Bank feed — transactions, categorization, reconciliation, bank accounts — transaction categories · out→3 in←0 · leaf · →accounting.accounts, catalogs.accounts, org.companies
- `banking.transfers` — Bank feed — transactions, categorization, reconciliation, bank accounts — transfers · out→2 in←1 · wired · →identity.users, org.companies

### brokerupdate  (2)
- `brokerupdate.profile` — brokerupdate — profile · out→0 in←1 · root/ref
- `brokerupdate.send` — brokerupdate — send · out→1 in←0 · leaf · →brokerupdate.profile

### catalogs  (39)
- `catalogs.account_role_bindings` — Per-entity master catalogs — chart of accounts, items, classes, vendors/customers ref, role bindings — account role bindings · out→3 in←0 · leaf · →catalogs.accounts, identity.users, org.companies
- `catalogs.account_types` — **GLOBAL-BY-DESIGN** (no `operating_company_id`; shared CoA type taxonomy; `companyScoped:false`; do NOT per-entity convert — see `docs/trackers/GLOBAL-BY-DESIGN-CATALOGS-2026-07-25.md`) · out→0 in←1 · root/ref
- `catalogs.accounts` — Per-entity master catalogs — chart of accounts, items, classes, vendors/customers ref, role bindings — accounts · out→2 in←26 · wired · →identity.users, org.companies
- `catalogs.audit_event_types` — Per-entity master catalogs — chart of accounts, items, classes, vendors/customers ref, role bindings — audit event types · out→0 in←0 · island(by-design)
- `catalogs.cancellation_reasons` — Per-entity master catalogs — chart of accounts, items, classes, vendors/customers ref, role bindings — cancellation reasons · out→0 in←1 · root/ref
- `catalogs.cargo_claim_reasons` — Per-entity master catalogs — chart of accounts, items, classes, vendors/customers ref, role bindings — cargo claim reasons · out→1 in←0 · leaf · →org.companies
- `catalogs.catalog_registry` — Per-entity master catalogs — chart of accounts, items, classes, vendors/customers ref, role bindings — catalog registry · out→0 in←0 · island(by-design)
- `catalogs.classes` — Per-entity master catalogs — chart of accounts, items, classes, vendors/customers ref, role bindings — classes · out→2 in←4 · wired · →identity.users, org.companies
- `catalogs.company_violation_types` — Per-entity master catalogs — chart of accounts, items, classes, vendors/customers ref, role bindings — company violation types · out→1 in←1 · wired · →org.companies
- `catalogs.complaint_types` — Per-entity master catalogs — chart of accounts, items, classes, vendors/customers ref, role bindings — complaint types · out→1 in←1 · wired · →org.companies
- `catalogs.customer_quality_event_reasons` — Per-entity master catalogs — chart of accounts, items, classes, vendors/customers ref, role bindings — customer quality event reasons · out→0 in←1 · root/ref
- `catalogs.detail_types` — Per-entity master catalogs — chart of accounts, items, classes, vendors/customers ref, role bindings — detail types · out→2 in←0 · leaf · →catalogs.account_types, org.companies
- `catalogs.dispatch_flag_colors` — Per-entity master catalogs — chart of accounts, items, classes, vendors/customers ref, role bindings — dispatch flag colors · out→2 in←0 · leaf · →identity.users, org.companies
- `catalogs.dispatcher_error_reasons` — Per-entity master catalogs — chart of accounts, items, classes, vendors/customers ref, role bindings — dispatcher error reasons · out→0 in←1 · root/ref
- `catalogs.dot_violation_types` — Per-entity master catalogs — chart of accounts, items, classes, vendors/customers ref, role bindings — dot violation types · out→1 in←0 · leaf · →org.companies
- `catalogs.driver_leave_balances` — Per-entity master catalogs — chart of accounts, items, classes, vendors/customers ref, role bindings — driver leave balances · out→2 in←0 · leaf · →mdata.drivers, org.companies
- `catalogs.driver_load_statuses` — Per-entity master catalogs — chart of accounts, items, classes, vendors/customers ref, role bindings — driver load statuses · out→0 in←0 · island(by-design)
- `catalogs.driver_termination_reasons` — Per-entity master catalogs — chart of accounts, items, classes, vendors/customers ref, role bindings — driver termination reasons · out→0 in←1 · root/ref
- `catalogs.equipment_line_item_templates` — Per-entity master catalogs — chart of accounts, items, classes, vendors/customers ref, role bindings — equipment line item templates · out→1 in←1 · wired · →catalogs.equipment_types
- `catalogs.equipment_types` — Per-entity master catalogs — chart of accounts, items, classes, vendors/customers ref, role bindings — equipment types · out→0 in←3 · root/ref
- `catalogs.equipment_types_dedup_ledger_0318` — Per-entity master catalogs — chart of accounts, items, classes, vendors/customers ref, role bindings — equipment types dedup ledger 0318 · out→2 in←0 · leaf · →?.before, catalogs.equipment_types
- `catalogs.tire_positions` — **GLOBAL-BY-DESIGN** (no `operating_company_id`; excluded from fleet per-entity conversion; `companyScoped:false` — see `docs/trackers/GLOBAL-BY-DESIGN-CATALOGS-2026-07-25.md`) · out→0 in←0 · island(by-design)
- `catalogs.excel_upload_jobs` — Per-entity master catalogs — chart of accounts, items, classes, vendors/customers ref, role bindings — excel upload jobs · out→0 in←0 · island(by-design)
- `catalogs.file_categories` — Per-entity master catalogs — chart of accounts, items, classes, vendors/customers ref, role bindings — file categories · out→0 in←1 · root/ref
- `catalogs.fmcsa_lookups` — Per-entity master catalogs — chart of accounts, items, classes, vendors/customers ref, role bindings — fmcsa lookups · out→2 in←1 · wired · →identity.users, org.companies
- `catalogs.form_425c_company_profiles` — Per-entity master catalogs — chart of accounts, items, classes, vendors/customers ref, role bindings — form 425c company profiles · out→2 in←0 · leaf · →identity.users, org.companies
- `catalogs.internal_fine_reasons` — Per-entity master catalogs — chart of accounts, items, classes, vendors/customers ref, role bindings — internal fine reasons · out→1 in←1 · wired · →org.companies
- `catalogs.items` — Per-entity master catalogs — chart of accounts, items, classes, vendors/customers ref, role bindings — items · out→8 in←0 · leaf · →?.a, ?.is, catalogs.accounts, catalogs.classes, catalogs.qbo_categories, identity.users, mdata.vendors, org.companies
- `catalogs.labor_rates` — Per-entity master catalogs — chart of accounts, items, classes, vendors/customers ref, role bindings — labor rates · out→1 in←0 · leaf · →org.companies
- `catalogs.leave_policies` — Per-entity master catalogs — chart of accounts, items, classes, vendors/customers ref, role bindings — leave policies · out→2 in←0 · leaf · →identity.users, org.companies
- `catalogs.load_cancellation_reasons` — Per-entity master catalogs — chart of accounts, items, classes, vendors/customers ref, role bindings — load cancellation reasons · out→2 in←1 · wired · →identity.users, org.companies
- `catalogs.maintenance_part_locations` — Per-entity master catalogs — chart of accounts, items, classes, vendors/customers ref, role bindings — maintenance part locations · out→1 in←0 · leaf · →org.companies
- `catalogs.mexico_states` — Per-entity master catalogs — chart of accounts, items, classes, vendors/customers ref, role bindings — mexico states · out→0 in←0 · island(by-design)
- `catalogs.parts` — Per-entity master catalogs — chart of accounts, items, classes, vendors/customers ref, role bindings — parts · out→1 in←0 · leaf · →org.companies
- `catalogs.payment_terms` — Per-entity master catalogs — chart of accounts, items, classes, vendors/customers ref, role bindings — payment terms · out→1 in←2 · wired · →identity.users
- `catalogs.posting_templates` — Per-entity master catalogs — chart of accounts, items, classes, vendors/customers ref, role bindings — posting templates · out→3 in←0 · leaf · →catalogs.accounts, catalogs.classes, identity.users
- `catalogs.us_states` — Per-entity master catalogs — chart of accounts, items, classes, vendors/customers ref, role bindings — us states · out→0 in←0 · island(by-design)
- `catalogs.void_cancel_reasons` — Per-entity master catalogs — chart of accounts, items, classes, vendors/customers ref, role bindings — void cancel reasons · out→2 in←1 · wired · →identity.users, org.companies
- `catalogs.wo_cancellation_reasons` — **GLOBAL-BY-DESIGN** (no `operating_company_id`; shared WO cancel taxonomy; do NOT per-entity convert — see `docs/trackers/GLOBAL-BY-DESIGN-CATALOGS-2026-07-25.md`) · out→0 in←0 · island(by-design)
- `catalogs.workflow_requests` — Per-entity master catalogs — chart of accounts, items, classes, vendors/customers ref, role bindings — workflow requests · out→1 in←0 · leaf · →identity.users

### chat  (5)
- `chat.attachments` — chat — attachments · out→3 in←0 · leaf · →chat.messages, docs.files, org.companies
- `chat.message_receipts` — chat — message receipts · out→3 in←0 · leaf · →chat.messages, chat.participants, org.companies
- `chat.messages` — chat — messages · out→5 in←2 · wired · →chat.threads, driver_finance.cash_advance_requests, identity.users, mdata.drivers, org.companies
- `chat.participants` — chat — participants · out→4 in←1 · wired · →chat.threads, identity.users, mdata.drivers, org.companies
- `chat.threads` — chat — threads · out→3 in←2 · wired · →identity.users, mdata.loads, org.companies

### compliance  (17)
- `compliance.csa_basic_scores` — Regulatory filings — IFTA, 2290, IRP, permits, property-tax rendition, credentials — csa basic scores · out→1 in←0 · leaf · →org.companies
- `compliance.csa_mitigation_actions` — Regulatory filings — IFTA, 2290, IRP, permits, property-tax rendition, credentials — csa mitigation actions · out→2 in←0 · leaf · →identity.users, org.companies
- `compliance.dot_inspection_event_followups` — Regulatory filings — IFTA, 2290, IRP, permits, property-tax rendition, credentials — dot inspection event followups · out→3 in←0 · leaf · →compliance.dot_inspection_events, identity.users, org.companies
- `compliance.dot_inspection_events` — Regulatory filings — IFTA, 2290, IRP, permits, property-tax rendition, credentials — dot inspection events · out→5 in←1 · wired · →geo.geofences, identity.users, mdata.drivers, mdata.units, org.companies
- `compliance.drug_alcohol_pool_members` — Regulatory filings — IFTA, 2290, IRP, permits, property-tax rendition, credentials — drug alcohol pool members · out→2 in←0 · leaf · →mdata.drivers, org.companies
- `compliance.drug_alcohol_random_draws` — Regulatory filings — IFTA, 2290, IRP, permits, property-tax rendition, credentials — drug alcohol random draws · out→1 in←1 · wired · →org.companies
- `compliance.drug_alcohol_random_selections` — Regulatory filings — IFTA, 2290, IRP, permits, property-tax rendition, credentials — drug alcohol random selections · out→3 in←0 · leaf · →compliance.drug_alcohol_random_draws, mdata.drivers, org.companies
- `compliance.drug_alcohol_test_results` — Regulatory filings — IFTA, 2290, IRP, permits, property-tax rendition, credentials — drug alcohol test results · out→2 in←1 · wired · →mdata.drivers, org.companies
- `compliance.form_2290_filing_vehicles` — Regulatory filings — IFTA, 2290, IRP, permits, property-tax rendition, credentials — form 2290 filing vehicles · out→3 in←0 · leaf · →compliance.form_2290_filings, mdata.units, org.companies
- `compliance.form_2290_filings` — Regulatory filings — IFTA, 2290, IRP, permits, property-tax rendition, credentials — form 2290 filings · out→2 in←1 · wired · →identity.users, org.companies
- `compliance.form_425c_exhibit_a_entries` — Regulatory filings — IFTA, 2290, IRP, permits, property-tax rendition, credentials — form 425c exhibit a entries · out→1 in←0 · leaf · →compliance.form_425c_reports
- `compliance.form_425c_exhibit_b_entries` — Regulatory filings — IFTA, 2290, IRP, permits, property-tax rendition, credentials — form 425c exhibit b entries · out→1 in←0 · leaf · →compliance.form_425c_reports
- `compliance.form_425c_reports` — Regulatory filings — IFTA, 2290, IRP, permits, property-tax rendition, credentials — form 425c reports · out→3 in←2 · wired · →docs.files, identity.users, org.companies
- `compliance.notification_log` — Regulatory filings — IFTA, 2290, IRP, permits, property-tax rendition, credentials — notification log · out→2 in←0 · leaf · →compliance.notification_rules, org.companies
- `compliance.notification_rules` — Regulatory filings — IFTA, 2290, IRP, permits, property-tax rendition, credentials — notification rules · out→1 in←1 · wired · →org.companies
- `compliance.required_document_types` — Regulatory filings — IFTA, 2290, IRP, permits, property-tax rendition, credentials — required document types · out→0 in←0 · island(by-design)
- `compliance.return_to_duty_processes` — Regulatory filings — IFTA, 2290, IRP, permits, property-tax rendition, credentials — return to duty processes · out→3 in←0 · leaf · →compliance.drug_alcohol_test_results, mdata.drivers, org.companies

### customer  (1)
- `customer.contract` — customer — contract · out→4 in←0 · leaf · →docs.files, identity.users, mdata.customers, org.companies

### dispatch  (25)
- `dispatch.auto_status_suggestion_responses` — Dispatch operations — assignments, load assignment history, board state — auto status suggestion responses · out→3 in←0 · leaf · →dispatch.auto_status_suggestions, identity.users, org.companies
- `dispatch.auto_status_suggestions` — Dispatch operations — assignments, load assignment history, board state — auto status suggestions · out→5 in←1 · wired · →identity.users, mdata.drivers, mdata.loads, mdata.units, org.companies
- `dispatch.bol_documents` — Dispatch operations — assignments, load assignment history, board state — bol documents · out→3 in←0 · leaf · →identity.users, mdata.loads, org.companies
- `dispatch.border_crossing_events` — Dispatch operations — assignments, load assignment history, board state — border crossing events · out→3 in←0 · leaf · →mdata.drivers, mdata.loads, org.companies
- `dispatch.cargo_sensor_readings` — Dispatch operations — assignments, load assignment history, board state — cargo sensor readings · out→3 in←0 · leaf · →mdata.loads, mdata.units, org.companies
- `dispatch.customer_notify_preferences` — Dispatch operations — assignments, load assignment history, board state — customer notify preferences · out→3 in←0 · leaf · →?.enable, mdata.customers, org.companies
- `dispatch.detention_events` — Dispatch operations — assignments, load assignment history, board state — detention events · out→6 in←2 · wired · →dispatch.stop_arrivals, mdata.drivers, mdata.load_stops, mdata.loads, mdata.units, org.companies
- `dispatch.detention_evidence` — Dispatch operations — assignments, load assignment history, board state — detention evidence · out→6 in←0 · leaf · →dispatch.detention_events, dispatch.detention_requests, mdata.load_stops, mdata.loads, mdata.units, org.companies
- `dispatch.detention_requests` — Dispatch operations — assignments, load assignment history, board state — detention requests · out→5 in←1 · wired · →dispatch.detention_events, mdata.customers, mdata.load_stops, mdata.loads, org.companies
- `dispatch.driver_layovers` — Dispatch operations — assignments, load assignment history, board state — driver layovers · out→3 in←0 · leaf · →mdata.drivers, mdata.loads, org.companies
- `dispatch.equipment_transfer_requests` — Dispatch operations — assignments, load assignment history, board state — equipment transfer requests · out→3 in←0 · leaf · →identity.users, mdata.drivers, org.companies
- `dispatch.intransit_issues` — Dispatch operations — assignments, load assignment history, board state — intransit issues · out→5 in←0 · leaf · →mdata.drivers, mdata.load_stops, mdata.loads, mdata.units, org.companies
- `dispatch.load_abandonments` — Dispatch operations — assignments, load assignment history, board state — load abandonments · out→5 in←0 · leaf · →identity.users, mdata.drivers, mdata.loads, mdata.units, org.companies
- `dispatch.load_assignment_history` — Dispatch operations — assignments, load assignment history, board state — load assignment history · out→6 in←0 · leaf · →identity.users, mdata.drivers, mdata.equipment, mdata.loads, mdata.units, org.companies
- `dispatch.load_cancellations` — Dispatch operations — assignments, load assignment history, board state — load cancellations · out→5 in←0 · leaf · →catalogs.cancellation_reasons, catalogs.load_cancellation_reasons, identity.users, mdata.loads, org.companies
- `dispatch.load_eta_predictions` — Dispatch operations — assignments, load assignment history, board state — load eta predictions · out→2 in←0 · leaf · →mdata.load_stops, mdata.loads
- `dispatch.load_id_reservations` — Dispatch operations — assignments, load assignment history, board state — load id reservations · out→3 in←0 · leaf · →identity.users, mdata.loads, org.companies
- `dispatch.load_templates` — Dispatch operations — assignments, load assignment history, board state — load templates · out→2 in←0 · leaf · →identity.users, org.companies
- `dispatch.loads` — Dispatch operations — assignments, load assignment history, board state — loads · out→0 in←0 · ★ISLAND-VERIFY
- `dispatch.notify_log` — Dispatch operations — assignments, load assignment history, board state — notify log · out→6 in←0 · leaf · →?.for, ?.to, mdata.customers, mdata.load_stops, mdata.loads, org.companies
- `dispatch.ocr_intake_queue` — Dispatch operations — assignments, load assignment history, board state — ocr intake queue · out→2 in←0 · leaf · →mdata.loads, org.companies
- `dispatch.pod_documents` — Dispatch operations — assignments, load assignment history, board state — pod documents · out→5 in←0 · leaf · →identity.users, mdata.drivers, mdata.load_stops, mdata.loads, org.companies
- `dispatch.ratecon_extractions` — Dispatch operations — assignments, load assignment history, board state — ratecon extractions · out→1 in←0 · leaf · →docs.files
- `dispatch.stop_arrivals` — Dispatch operations — assignments, load assignment history, board state — stop arrivals · out→5 in←1 · wired · →identity.users, mdata.drivers, mdata.load_stops, mdata.units, org.companies
- `dispatch.stop_extra_rates` — Dispatch operations — assignments, load assignment history, board state — stop extra rates · out→4 in←0 · leaf · →accounting.invoice_lines, identity.users, mdata.load_stops, mdata.loads

### docs  (2)
- `docs.file_links` — docs — file links · out→2 in←0 · leaf · →docs.files, identity.users
- `docs.files` — docs — files · out→4 in←10 · wired · →catalogs.file_categories, identity.users, mdata.loads, org.companies

### documents  (2)
- `documents.attachments` — documents — attachments · out→2 in←3 · wired · →identity.users, org.companies
- `documents.damage_photo_evidence` — documents — damage photo evidence · out→2 in←0 · leaf · →org.companies, safety.incidents

### driver_finance  (27)
- `driver_finance.abandonment_chargebacks` — Driver pay — settlements, settlement lines, deductions, advances, escrow, bills — abandonment chargebacks · out→5 in←0 · leaf · →driver_finance.driver_settlements, identity.users, mdata.drivers, mdata.loads, org.companies
- `driver_finance.abandonment_defaults` — Driver pay — settlements, settlement lines, deductions, advances, escrow, bills — abandonment defaults · out→1 in←0 · leaf · →org.companies
- `driver_finance.auto_deduction_policies` — Driver pay — settlements, settlement lines, deductions, advances, escrow, bills — auto deduction policies · out→3 in←2 · wired · →identity.users, mdata.drivers, org.companies
- `driver_finance.cash_advance_owner_approval_audit` — Driver pay — settlements, settlement lines, deductions, advances, escrow, bills — cash advance owner approval audit · out→2 in←0 · leaf · →driver_finance.cash_advance_requests, org.companies
- `driver_finance.cash_advance_request_audit` — Driver pay — settlements, settlement lines, deductions, advances, escrow, bills — cash advance request audit · out→3 in←0 · leaf · →driver_finance.cash_advance_requests, identity.users, org.companies
- `driver_finance.cash_advance_requests` — Driver pay — settlements, settlement lines, deductions, advances, escrow, bills — cash advance requests · out→5 in←3 · wired · →driver_finance.driver_advances, identity.users, mdata.drivers, mdata.loads, org.companies
- `driver_finance.deduction_schedule` — Driver pay — settlements, settlement lines, deductions, advances, escrow, bills — deduction schedule · out→4 in←0 · leaf · →driver_finance.driver_liabilities, identity.users, mdata.drivers, org.companies
- `driver_finance.driver_advance_accounts` — Driver pay — settlements, settlement lines, deductions, advances, escrow, bills — driver advance accounts · out→4 in←0 · leaf · →catalogs.accounts, identity.users, mdata.drivers, org.companies
- `driver_finance.driver_advances` — Driver pay — settlements, settlement lines, deductions, advances, escrow, bills — driver advances · out→7 in←1 · wired · →accounting.bills, driver_finance.driver_bills, driver_finance.driver_liabilities, identity.users, mdata.drivers, mdata.loads, org.companies
- `driver_finance.driver_bills` — Driver pay — settlements, settlement lines, deductions, advances, escrow, bills — driver bills · out→4 in←2 · wired · →identity.users, mdata.drivers, mdata.loads, org.companies
- `driver_finance.driver_deduction_bucket_events` — Driver pay — settlements, settlement lines, deductions, advances, escrow, bills — driver deduction bucket events · out→6 in←0 · leaf · →accounting.expenses, driver_finance.driver_deduction_buckets, driver_finance.driver_settlement_deductions, driver_finance.driver_settlements, identity.users, org.companies
- `driver_finance.driver_deduction_buckets` — Driver pay — settlements, settlement lines, deductions, advances, escrow, bills — driver deduction buckets · out→3 in←2 · wired · →identity.users, mdata.drivers, org.companies
- `driver_finance.driver_liabilities` — Driver pay — settlements, settlement lines, deductions, advances, escrow, bills — driver liabilities · out→2 in←3 · wired · →mdata.drivers, org.companies
- `driver_finance.driver_pay_settings` — Driver pay — settlements, settlement lines, deductions, advances, escrow, bills — driver pay settings · out→3 in←0 · leaf · →identity.users, mdata.drivers, org.companies
- `driver_finance.driver_settlement_deductions` — Driver pay — settlements, settlement lines, deductions, advances, escrow, bills — driver settlement deductions · out→8 in←1 · wired · →accounting.expenses, driver_finance.driver_deduction_buckets, driver_finance.driver_settlements, driver_finance.escrow_deductions_pending, identity.users, mdata.drivers, mdata.loads, org.companies
- `driver_finance.driver_settlement_disputes` — Driver pay — settlements, settlement lines, deductions, advances, escrow, bills — driver settlement disputes · out→4 in←0 · leaf · →driver_finance.driver_settlements, identity.users, mdata.drivers, org.companies
- `driver_finance.driver_settlements` — Driver pay — settlements, settlement lines, deductions, advances, escrow, bills — driver settlements · out→4 in←9 · wired · →identity.users, mdata.drivers, mdata.loads, org.companies
- `driver_finance.escrow_balances` — Driver pay — settlements, settlement lines, deductions, advances, escrow, bills — escrow balances · out→3 in←1 · wired · →mdata.drivers, org.companies, settlement.settlement
- `driver_finance.escrow_deductions_pending` — Driver pay — settlements, settlement lines, deductions, advances, escrow, bills — escrow deductions pending · out→4 in←1 · wired · →identity.users, mdata.drivers, mdata.loads, org.companies
- `driver_finance.escrow_ledger` — Driver pay — settlements, settlement lines, deductions, advances, escrow, bills — escrow ledger · out→5 in←0 · leaf · →driver_finance.escrow_balances, mdata.drivers, org.companies, settlement.settlement, settlement.settlement_line
- `driver_finance.settlement_disputes` — Driver pay — settlements, settlement lines, deductions, advances, escrow, bills — settlement disputes · out→4 in←0 · leaf · →driver_finance.driver_settlements, identity.users, mdata.drivers, org.companies
- `driver_finance.settlement_lines` — Driver pay — settlements, settlement lines, deductions, advances, escrow, bills — settlement lines · out→5 in←0 · leaf · →driver_finance.auto_deduction_policies, driver_finance.driver_bills, driver_finance.driver_settlements, mdata.driver_teams, org.companies
- `driver_finance.settlement_payment_events` — Driver pay — settlements, settlement lines, deductions, advances, escrow, bills — settlement payment events · out→2 in←0 · leaf · →identity.users, org.companies
- `driver_finance.settlement_preview_costs` — Driver pay — settlements, settlement lines, deductions, advances, escrow, bills — settlement preview costs · out→2 in←0 · leaf · →mdata.drivers, org.companies
- `driver_finance.signed_acknowledgments` — Driver pay — settlements, settlement lines, deductions, advances, escrow, bills — signed acknowledgments · out→3 in←0 · leaf · →mdata.drivers, mdata.loads, org.companies
- `driver_finance.team_settlement_splits` — Driver pay — settlements, settlement lines, deductions, advances, escrow, bills — team settlement splits · out→5 in←0 · leaf · →driver_finance.driver_settlements, mdata.driver_teams, mdata.drivers, mdata.loads, org.companies
- `driver_finance.trip_link_queue` — Driver pay — settlements, settlement lines, deductions, advances, escrow, bills — trip link queue · out→5 in←0 · leaf · →identity.users, mdata.loads, mdata.units, org.companies, settlement.settlement_line

### driver_pay  (1)
- `driver_pay.settlements` — driver_pay — settlements · out→0 in←1 · root/ref

### driver_pwa  (1)
- `driver_pwa.push_subscriptions` — driver_pwa — push subscriptions · out→2 in←0 · leaf · →mdata.drivers, org.companies

### driveralert  (2)
- `driveralert.alarm_event` — driveralert — alarm event · out→1 in←0 · leaf · →driveralert.dispatch
- `driveralert.dispatch` — driveralert — dispatch · out→0 in←1 · root/ref

### drivers  (1)
- `drivers.retention_scores` — drivers — retention scores · out→2 in←0 · leaf · →mdata.drivers, org.companies

### email  (2)
- `email.email_alerts` — email — email alerts · out→3 in←0 · leaf · →email.email_queue, identity.users, org.companies
- `email.email_queue` — email — email queue · out→2 in←2 · wired · →identity.users, org.companies

### events  (1)
- `events.event_log` — Event log / outbox — event log · out→0 in←0 · island(by-design)

### expense_attribution  (2)
- `expense_attribution.expense_load_links` — expense_attribution — expense load links · out→2 in←0 · leaf · →mdata.loads, org.companies
- `expense_attribution.expense_seq_per_load` — expense_attribution — expense seq per load · out→1 in←0 · leaf · →mdata.loads

### factor  (4)
- `factor.faro_daily_imports` — Factoring (Faro) — advances, reserve, funding — faro daily imports · out→2 in←2 · wired · →identity.users, org.companies
- `factor.faro_invoice_lines` — Factoring (Faro) — advances, reserve, funding — faro invoice lines · out→3 in←0 · leaf · →factor.faro_daily_imports, mdata.loads, org.companies
- `factor.reconciliation_items` — Factoring (Faro) — advances, reserve, funding — reconciliation items · out→3 in←0 · leaf · →accounting.invoices, factor.reconciliation_runs, org.companies
- `factor.reconciliation_runs` — Factoring (Faro) — advances, reserve, funding — reconciliation runs · out→4 in←1 · wired · →factor.faro_daily_imports, identity.users, mdata.vendors, org.companies

### factoring  (5)
- `factoring.bank_match_suggestion` — Factoring posting/workflow — bank match suggestion · out→3 in←0 · leaf · →banking.bank_transactions, factoring.batch, org.companies
- `factoring.batch` — Factoring posting/workflow — batch · out→2 in←2 · wired · →factoring.factor, org.companies
- `factoring.customer_factor_assignment` — Factoring posting/workflow — customer factor assignment · out→3 in←0 · leaf · →factoring.factor, mdata.customers, org.companies
- `factoring.factor` — Factoring posting/workflow — factor · out→1 in←3 · wired · →org.companies
- `factoring.reserve_movement` — Factoring posting/workflow — reserve movement · out→2 in←0 · leaf · →factoring.batch, org.companies

### finance  (2)
- `finance.loan_amortization_rows` — finance — loan amortization rows · out→4 in←0 · leaf · →accounting.journal_entries, finance.loans, identity.users, org.companies
- `finance.loans` — finance — loans · out→3 in←1 · wired · →catalogs.accounts, identity.users, org.companies

### fixed_assets  (4)
- `fixed_assets.asset_classes` — Fixed asset register & depreciation — asset classes · out→3 in←1 · wired · →catalogs.accounts, identity.users, org.companies
- `fixed_assets.assets` — Fixed asset register & depreciation — assets · out→5 in←2 · wired · →catalogs.accounts, fixed_assets.asset_classes, identity.users, mdata.units, org.companies
- `fixed_assets.depreciation_schedules` — Fixed asset register & depreciation — depreciation schedules · out→4 in←0 · leaf · →accounting.journal_entries, fixed_assets.assets, identity.users, org.companies
- `fixed_assets.disposals` — Fixed asset register & depreciation — disposals · out→4 in←0 · leaf · →accounting.journal_entries, fixed_assets.assets, identity.users, org.companies

### forecast  (3)
- `forecast.cash_entries` — forecast — cash entries · out→0 in←0 · island(by-design)
- `forecast.opening_balance` — forecast — opening balance · out→0 in←0 · island(by-design)
- `forecast.predicted_delivery_changes` — forecast — predicted delivery changes · out→0 in←0 · island(by-design)

### fuel  (3)
- `fuel.fraud_alerts` — fuel — fraud alerts · out→3 in←0 · leaf · →fuel.fuel_transactions, identity.users, org.companies
- `fuel.fuel_planner_settings` — fuel — fuel planner settings · out→0 in←0 · island(by-design)
- `fuel.fuel_transactions` — fuel — fuel transactions · out→4 in←1 · wired · →mdata.drivers, mdata.loads, mdata.units, org.companies

### geo  (3)
- `geo.geofence_events` — geo — geofence events · out→4 in←0 · leaf · →geo.geofences, mdata.drivers, mdata.units, org.companies
- `geo.geofence_state_transitions` — geo — geofence state transitions · out→4 in←0 · leaf · →geo.geofences, mdata.loads, mdata.units, org.companies
- `geo.geofences` — geo — geofences · out→2 in←4 · wired · →identity.users, org.companies

### geofence  (2)
- `geofence.event` — geofence — event · out→1 in←1 · wired · →geofence.fence
- `geofence.fence` — geofence — fence · out→0 in←1 · root/ref

### governance  (1)
- `governance.void_cancel_requests` — governance — void cancel requests · out→3 in←0 · leaf · →catalogs.void_cancel_reasons, identity.users, org.companies

### hos  (1)
- `hos.duty_status_events` — Hours-of-service — duty status events (append-only) — duty status events · out→3 in←0 · leaf · →mdata.drivers, mdata.units, org.companies

### identity  (10)
- `identity.applicant_documents` — Auth & users — sessions, roles, permissions, preferences — applicant documents · out→2 in←0 · leaf · →identity.driver_applicants, org.companies
- `identity.driver_applicants` — Auth & users — sessions, roles, permissions, preferences — driver applicants · out→4 in←1 · wired · →identity.users, mdata.drivers, org.companies, safety.onboarding_sessions
- `identity.driver_invites` — Auth & users — sessions, roles, permissions, preferences — driver invites · out→3 in←0 · leaf · →identity.users, mdata.drivers, org.companies
- `identity.email_verifications` — Auth & users — sessions, roles, permissions, preferences — email verifications · out→0 in←0 · island(by-design)
- `identity.password_reset_tokens` — Auth & users — sessions, roles, permissions, preferences — password reset tokens · out→1 in←0 · leaf · →identity.users
- `identity.sessions` — Auth & users — sessions, roles, permissions, preferences — sessions · out→1 in←0 · leaf · →identity.users
- `identity.user_notification_preferences` — Auth & users — sessions, roles, permissions, preferences — user notification preferences · out→5 in←0 · leaf · →?.add, ?.enable, ?.for, ?.to, identity.users
- `identity.user_preferences` — Auth & users — sessions, roles, permissions, preferences — user preferences · out→7 in←0 · leaf · →?.add, ?.enable, ?.for, ?.force, ?.jsonb, ?.to, identity.users
- `identity.users` — Auth & users — sessions, roles, permissions, preferences — users · out→1 in←214 · wired · →org.companies
- `identity.workflow_requests` — Auth & users — sessions, roles, permissions, preferences — workflow requests · out→1 in←0 · leaf · →identity.users

### ifta  (4)
- `ifta.quarterly_preparations` — IFTA fuel-tax quarterly prep — quarterly preparations · out→1 in←3 · wired · →org.companies
- `ifta.state_gallons_by_quarter` — IFTA fuel-tax quarterly prep — state gallons by quarter · out→1 in←0 · leaf · →ifta.quarterly_preparations
- `ifta.state_miles_by_quarter` — IFTA fuel-tax quarterly prep — state miles by quarter · out→1 in←0 · leaf · →ifta.quarterly_preparations
- `ifta.state_tax_by_quarter` — IFTA fuel-tax quarterly prep — state tax by quarter · out→1 in←0 · leaf · →ifta.quarterly_preparations

### insurance  (8)
- `insurance.claim` — Insurance — policies, coverage, claims linkage — claim · out→3 in←1 · wired · →insurance.policy, mdata.assets, org.companies
- `insurance.coi_request` — Insurance — policies, coverage, claims linkage — coi request · out→3 in←0 · leaf · →insurance.policy, mdata.customers, org.companies
- `insurance.lawsuit` — Insurance — policies, coverage, claims linkage — lawsuit · out→2 in←0 · leaf · →insurance.claim, org.companies
- `insurance.payment_schedule` — Insurance — policies, coverage, claims linkage — payment schedule · out→3 in←0 · leaf · →accounting.bills, insurance.policy, org.companies
- `insurance.policy` — Insurance — policies, coverage, claims linkage — policy · out→2 in←5 · wired · →insurance.type_catalog, org.companies
- `insurance.policy_unit` — Insurance — policies, coverage, claims linkage — policy unit · out→3 in←0 · leaf · →insurance.policy, mdata.assets, org.companies
- `insurance.refund_obligation` — Insurance — policies, coverage, claims linkage — refund obligation · out→2 in←0 · leaf · →insurance.policy, org.companies
- `insurance.type_catalog` — Insurance — policies, coverage, claims linkage — type catalog · out→1 in←1 · wired · →org.companies

### integrations  (21)
- `integrations.active_driver_set_cache` — External integrations — Samsara/telematics, provider sync state — active driver set cache · out→0 in←0 · island(by-design)
- `integrations.auto_status_position_snapshots` — External integrations — Samsara/telematics, provider sync state — auto status position snapshots · out→2 in←0 · leaf · →mdata.units, org.companies
- `integrations.auto_status_switch_events` — External integrations — Samsara/telematics, provider sync state — auto status switch events · out→4 in←0 · leaf · →mdata.drivers, mdata.loads, mdata.units, org.companies
- `integrations.edi_messages` — External integrations — Samsara/telematics, provider sync state — edi messages · out→2 in←0 · leaf · →integrations.edi_partners, org.companies
- `integrations.edi_partners` — External integrations — Samsara/telematics, provider sync state — edi partners · out→1 in←1 · wired · →org.companies
- `integrations.engine_fault_events` — External integrations — Samsara/telematics, provider sync state — engine fault events · out→2 in←0 · leaf · →maintenance.work_orders, org.companies
- `integrations.integration_sync_log` — External integrations — Samsara/telematics, provider sync state — integration sync log · out→1 in←0 · leaf · →org.companies
- `integrations.qbo_connections` — External integrations — Samsara/telematics, provider sync state — qbo connections · out→2 in←0 · leaf · →identity.users, org.companies
- `integrations.qbo_inbound_events` — External integrations — Samsara/telematics, provider sync state — qbo inbound events · out→1 in←0 · leaf · →org.companies
- `integrations.qbo_payroll_links` — External integrations — Samsara/telematics, provider sync state — qbo payroll links · out→1 in←0 · leaf · →org.companies
- `integrations.qbo_sync_conflicts` — External integrations — Samsara/telematics, provider sync state — qbo sync conflicts · out→2 in←0 · leaf · →identity.users, org.companies
- `integrations.qbo_sync_queue` — External integrations — Samsara/telematics, provider sync state — qbo sync queue · out→1 in←0 · leaf · →org.companies
- `integrations.qbo_vendor_linkage_events` — External integrations — Samsara/telematics, provider sync state — qbo vendor linkage events · out→2 in←0 · leaf · →identity.users, org.companies
- `integrations.samsara_config` — External integrations — Samsara/telematics, provider sync state — samsara config · out→1 in←0 · leaf · →org.companies
- `integrations.samsara_drivers` — External integrations — Samsara/telematics, provider sync state — samsara drivers · out→2 in←0 · leaf · →mdata.drivers, org.companies
- `integrations.samsara_remote_count_collection_state` — External integrations — Samsara/telematics, provider sync state — samsara remote count collection state · out→1 in←0 · leaf · →org.companies
- `integrations.samsara_remote_counts` — External integrations — Samsara/telematics, provider sync state — samsara remote counts · out→1 in←0 · leaf · →org.companies
- `integrations.samsara_vehicle_positions` — External integrations — Samsara/telematics, provider sync state — samsara vehicle positions · out→0 in←0 · island(by-design)
- `integrations.samsara_vehicles` — External integrations — Samsara/telematics, provider sync state — samsara vehicles · out→2 in←0 · leaf · →mdata.units, org.companies
- `integrations.samsara_webhook_events` — External integrations — Samsara/telematics, provider sync state — samsara webhook events · out→1 in←2 · wired · →org.companies
- `integrations.samsara_webhook_projection_state` — External integrations — Samsara/telematics, provider sync state — samsara webhook projection state · out→2 in←0 · leaf · →integrations.samsara_webhook_events, org.companies

### integrity  (1)
- `integrity.anomalies` — integrity — anomalies · out→0 in←0 · ★ISLAND-VERIFY

### legal  (11)
- `legal.contract_attorney_review_tokens` — Legal — contracts, templates, consent, e-sign, document links — contract attorney review tokens · out→3 in←0 · leaf · →identity.users, legal.contract_templates, org.companies
- `legal.contract_audit_log` — Legal — contracts, templates, consent, e-sign, document links — contract audit log · out→4 in←0 · leaf · →identity.users, legal.contract_instances, legal.contract_templates, org.companies
- `legal.contract_instance_links` — Legal — contracts, templates, consent, e-sign, document links — contract instance links · out→3 in←0 · leaf · →identity.users, legal.contract_instances, org.companies
- `legal.contract_instances` — Legal — contracts, templates, consent, e-sign, document links — contract instances · out→5 in←5 · wired · →documents.attachments, identity.users, legal.contract_templates, legal.matters, org.companies
- `legal.contract_signing_tokens` — Legal — contracts, templates, consent, e-sign, document links — contract signing tokens · out→3 in←0 · leaf · →identity.users, legal.contract_instances, org.companies
- `legal.contract_templates` — Legal — contracts, templates, consent, e-sign, document links — contract templates · out→2 in←3 · wired · →identity.users, org.companies
- `legal.matter_deadlines` — Legal — contracts, templates, consent, e-sign, document links — matter deadlines · out→3 in←0 · leaf · →identity.users, legal.matters, org.companies
- `legal.matter_documents` — Legal — contracts, templates, consent, e-sign, document links — matter documents · out→4 in←0 · leaf · →documents.attachments, identity.users, legal.matters, org.companies
- `legal.matter_events` — Legal — contracts, templates, consent, e-sign, document links — matter events · out→3 in←0 · leaf · →identity.users, legal.matters, org.companies
- `legal.matters` — Legal — contracts, templates, consent, e-sign, document links — matters · out→3 in←4 · wired · →identity.users, mdata.drivers, org.companies
- `legal.signatures` — Legal — contracts, templates, consent, e-sign, document links — signatures · out→2 in←0 · leaf · →legal.contract_instances, org.companies

### lib  (2)
- `lib.feature_flag_overrides` — Library — feature flags, feature_flag_overrides — feature flag overrides · out→3 in←0 · leaf · →identity.users, lib.feature_flags, org.companies
- `lib.feature_flags` — Library — feature flags, feature_flag_overrides — feature flags · out→0 in←1 · root/ref

### maint  (5)
- `maint.part` — Maintenance (legacy/aux) — part · out→1 in←1 · wired · →org.companies
- `maint.part_position_assignment` — Maintenance (legacy/aux) — part position assignment · out→1 in←0 · leaf · →maint.position_set
- `maint.pm_schedule` — Maintenance (legacy/aux) — pm schedule · out→2 in←0 · leaf · →mdata.assets, org.companies
- `maint.position_history` — Maintenance (legacy/aux) — position history · out→5 in←0 · leaf · →identity.users, maint.part, maint.position_set, mdata.units, org.companies
- `maint.position_set` — Maintenance (legacy/aux) — position set · out→0 in←2 · root/ref

### maintenance  (34)
- `maintenance.brake_projections` — Fleet maintenance — work orders, service, parts, PM schedules — brake projections · out→2 in←0 · leaf · →mdata.units, org.companies
- `maintenance.brake_wear_measurements` — Fleet maintenance — work orders, service, parts, PM schedules — brake wear measurements · out→3 in←0 · leaf · →identity.users, mdata.units, org.companies
- `maintenance.defects` — Fleet maintenance — work orders, service, parts, PM schedules — defects · out→3 in←0 · leaf · →maintenance.dvir_submissions, mdata.units, org.companies
- `maintenance.driver_reports` — Fleet maintenance — work orders, service, parts, PM schedules — driver reports · out→4 in←0 · leaf · →identity.users, mdata.drivers, mdata.loads, org.companies
- `maintenance.dvir_submissions` — Fleet maintenance — work orders, service, parts, PM schedules — dvir submissions · out→4 in←1 · wired · →mdata.drivers, mdata.loads, mdata.units, org.companies
- `maintenance.fault_code_severity_rules` — Fleet maintenance — work orders, service, parts, PM schedules — fault code severity rules · out→1 in←0 · leaf · →org.companies
- `maintenance.inspection_photos` — Fleet maintenance — work orders, service, parts, PM schedules — inspection photos · out→3 in←0 · leaf · →docs.files, maintenance.inspections, org.companies
- `maintenance.inspections` — Fleet maintenance — work orders, service, parts, PM schedules — inspections · out→4 in←1 · wired · →identity.users, mdata.units, org.companies, safety.dvir_submissions
- `maintenance.internal_labor_log` — Fleet maintenance — work orders, service, parts, PM schedules — internal labor log · out→4 in←0 · leaf · →accounting.journal_entries, identity.users, maintenance.work_orders, org.companies
- `maintenance.parts_inventory` — Fleet maintenance — work orders, service, parts, PM schedules — parts inventory · out→1 in←2 · wired · →mdata.vendors
- `maintenance.parts_invoice_links` — Fleet maintenance — work orders, service, parts, PM schedules — parts invoice links · out→3 in←0 · leaf · →maintenance.parts_inventory, maintenance.work_orders, mdata.vendors
- `maintenance.parts_warranty` — Fleet maintenance — work orders, service, parts, PM schedules — parts warranty · out→4 in←1 · wired · →maintenance.parts_inventory, maintenance.work_orders, mdata.vendors, org.companies
- `maintenance.pm_alerts` — Fleet maintenance — work orders, service, parts, PM schedules — pm alerts · out→5 in←0 · leaf · →identity.users, maintenance.pm_schedules, maintenance.work_orders, mdata.units, org.companies
- `maintenance.pm_auto_engine_settings` — Fleet maintenance — work orders, service, parts, PM schedules — pm auto engine settings · out→2 in←0 · leaf · →identity.users, org.companies
- `maintenance.pm_auto_wo_log` — Fleet maintenance — work orders, service, parts, PM schedules — pm auto wo log · out→5 in←0 · leaf · →maintenance.pm_schedule_runs, maintenance.pm_schedules, maintenance.work_orders, mdata.units, org.companies
- `maintenance.pm_schedule_runs` — Fleet maintenance — work orders, service, parts, PM schedules — pm schedule runs · out→1 in←1 · wired · →org.companies
- `maintenance.pm_schedules` — Fleet maintenance — work orders, service, parts, PM schedules — pm schedules · out→3 in←2 · wired · →identity.users, mdata.units, org.companies
- `maintenance.reefer_hours_log` — Fleet maintenance — work orders, service, parts, PM schedules — reefer hours log · out→3 in←0 · leaf · →identity.users, mdata.equipment, org.companies
- `maintenance.reefer_specs` — Fleet maintenance — work orders, service, parts, PM schedules — reefer specs · out→2 in←0 · leaf · →mdata.equipment, org.companies
- `maintenance.road_service_tickets` — Fleet maintenance — work orders, service, parts, PM schedules — road service tickets · out→6 in←0 · leaf · →identity.users, maintenance.work_orders, mdata.drivers, mdata.qbo_vendors, mdata.units, org.companies
- `maintenance.samsara_fault_code_history` — Fleet maintenance — work orders, service, parts, PM schedules — samsara fault code history · out→2 in←0 · leaf · →maintenance.work_orders, mdata.units
- `maintenance.severe_repair_estimates` — Fleet maintenance — work orders, service, parts, PM schedules — severe repair estimates · out→3 in←0 · leaf · →maintenance.work_orders, mdata.units, org.companies
- `maintenance.tire_brands` — Fleet maintenance — work orders, service, parts, PM schedules — tire brands · out→1 in←2 · wired · →org.companies
- `maintenance.tire_events` — Fleet maintenance — work orders, service, parts, PM schedules — tire events · out→5 in←0 · leaf · →identity.users, maintenance.tire_brands, maintenance.tire_records, maintenance.work_orders, org.companies
- `maintenance.tire_projections` — Fleet maintenance — work orders, service, parts, PM schedules — tire projections · out→2 in←0 · leaf · →mdata.units, org.companies
- `maintenance.tire_records` — Fleet maintenance — work orders, service, parts, PM schedules — tire records · out→6 in←1 · wired · →identity.users, maintenance.tire_brands, maintenance.work_orders, mdata.equipment, mdata.units, org.companies
- `maintenance.tire_tread_measurements` — Fleet maintenance — work orders, service, parts, PM schedules — tire tread measurements · out→3 in←0 · leaf · →identity.users, mdata.units, org.companies
- `maintenance.warranty_claims` — Fleet maintenance — work orders, service, parts, PM schedules — warranty claims · out→5 in←0 · leaf · →identity.users, maintenance.parts_warranty, maintenance.work_orders, mdata.vendors, org.companies
- `maintenance.wo_serialized_parts` — Fleet maintenance — work orders, service, parts, PM schedules — wo serialized parts · out→2 in←0 · leaf · →maintenance.work_orders, org.companies
- `maintenance.wo_status_history` — Fleet maintenance — work orders, service, parts, PM schedules — wo status history · out→2 in←0 · leaf · →identity.users, maintenance.work_orders
- `maintenance.wo_time_entries` — Fleet maintenance — work orders, service, parts, PM schedules — wo time entries · out→3 in←0 · leaf · →identity.users, maintenance.work_orders, org.companies
- `maintenance.work_order_lines` — Fleet maintenance — work orders, service, parts, PM schedules — work order lines · out→0 in←0 · ★ISLAND-VERIFY
- `maintenance.work_order_seq_per_month` — Fleet maintenance — work orders, service, parts, PM schedules — work order seq per month · out→1 in←0 · leaf · →org.companies
- `maintenance.work_orders` — Fleet maintenance — work orders, service, parts, PM schedules — work orders · out→7 in←21 · wired · →docs.files, identity.users, mdata.assets, mdata.equipment, mdata.loads, mdata.qbo_vendors, mdata.vendors

### master_data  (4)
- `master_data.customer_relationship_scores` — Master data (legacy/aux) — customer relationship scores · out→2 in←0 · leaf · →mdata.customers, org.companies
- `master_data.customer_terms_history` — Master data (legacy/aux) — customer terms history · out→3 in←0 · leaf · →identity.users, mdata.customers, org.companies
- `master_data.unit_permits` — Master data (legacy/aux) — unit permits · out→2 in←0 · leaf · →mdata.units, org.companies
- `master_data.unit_toll_tags` — Master data (legacy/aux) — unit toll tags · out→2 in←0 · leaf · →mdata.units, org.companies

### mdata  (45)
- `mdata.asset_status_history` — Operational master data — loads, stops, drivers, units, equipment, customers, vendors — asset status history · out→3 in←0 · leaf · →identity.users, mdata.assets, org.companies
- `mdata.assets` — Operational master data — loads, stops, drivers, units, equipment, customers, vendors — assets · out→1 in←6 · wired · →org.companies
- `mdata.customer_contacts` — Operational master data — loads, stops, drivers, units, equipment, customers, vendors — customer contacts · out→2 in←0 · leaf · →identity.users, mdata.customers
- `mdata.customer_lanes` — Operational master data — loads, stops, drivers, units, equipment, customers, vendors — customer lanes · out→2 in←0 · leaf · →mdata.customers, org.companies
- `mdata.customer_quality_events` — Operational master data — loads, stops, drivers, units, equipment, customers, vendors — customer quality events · out→3 in←0 · leaf · →catalogs.customer_quality_event_reasons, mdata.customers, mdata.loads
- `mdata.customers` — Operational master data — loads, stops, drivers, units, equipment, customers, vendors — customers · out→5 in←25 · wired · →catalogs.fmcsa_lookups, catalogs.payment_terms, identity.users, mdata.vendors, org.companies
- `mdata.dispatcher_safety_events` — Operational master data — loads, stops, drivers, units, equipment, customers, vendors — dispatcher safety events · out→5 in←0 · leaf · →catalogs.dispatcher_error_reasons, identity.users, mdata.customers, mdata.drivers, mdata.loads
- `mdata.driver_cdl_endorsements` — Operational master data — loads, stops, drivers, units, equipment, customers, vendors — driver cdl endorsements · out→2 in←0 · leaf · →mdata.drivers, reference.cdl_endorsements
- `mdata.driver_cdl_restrictions` — Operational master data — loads, stops, drivers, units, equipment, customers, vendors — driver cdl restrictions · out→2 in←0 · leaf · →mdata.drivers, reference.cdl_restrictions
- `mdata.driver_company_authorizations` — Operational master data — loads, stops, drivers, units, equipment, customers, vendors — driver company authorizations · out→2 in←0 · leaf · →mdata.drivers, org.companies
- `mdata.driver_equipment_qualifications` — Operational master data — loads, stops, drivers, units, equipment, customers, vendors — driver equipment qualifications · out→2 in←1 · wired · →catalogs.equipment_types, mdata.drivers
- `mdata.driver_pay_rates` — Operational master data — loads, stops, drivers, units, equipment, customers, vendors — driver pay rates · out→2 in←0 · leaf · →catalogs.equipment_line_item_templates, mdata.driver_equipment_qualifications
- `mdata.driver_profile_messages` — Operational master data — loads, stops, drivers, units, equipment, customers, vendors — driver profile messages · out→3 in←0 · leaf · →identity.users, mdata.drivers, org.companies
- `mdata.driver_safety_events` — Operational master data — loads, stops, drivers, units, equipment, customers, vendors — driver safety events · out→3 in←0 · leaf · →catalogs.driver_termination_reasons, mdata.drivers, mdata.loads
- `mdata.driver_teams` — Operational master data — loads, stops, drivers, units, equipment, customers, vendors — driver teams · out→3 in←3 · wired · →identity.users, mdata.drivers, org.companies
- `mdata.driver_vendor_merges` — Operational master data — loads, stops, drivers, units, equipment, customers, vendors — driver vendor merges · out→3 in←0 · leaf · →identity.users, mdata.drivers, org.companies
- `mdata.drivers` — Operational master data — loads, stops, drivers, units, equipment, customers, vendors — drivers · out→5 in←100 · wired · →identity.users, org.companies, reference.employment_statuses, reference.license_classes, reference.medical_card_statuses
- `mdata.entity_reclassification_log` — Operational master data — loads, stops, drivers, units, equipment, customers, vendors — entity reclassification log · out→1 in←0 · leaf · →identity.users
- `mdata.equipment` — Operational master data — loads, stops, drivers, units, equipment, customers, vendors — equipment · out→5 in←10 · wired · →identity.users, mdata.drivers, mdata.locations, mdata.units, org.companies
- `mdata.equipment_log` — Operational master data — loads, stops, drivers, units, equipment, customers, vendors — equipment log · out→4 in←0 · leaf · →identity.users, mdata.equipment, mdata.locations, mdata.units
- `mdata.equipment_plates` — Operational master data — loads, stops, drivers, units, equipment, customers, vendors — equipment plates · out→2 in←0 · leaf · →mdata.equipment, org.companies
- `mdata.equipment_transfers` — Operational master data — loads, stops, drivers, units, equipment, customers, vendors — equipment transfers · out→4 in←0 · leaf · →identity.users, mdata.drivers, mdata.equipment, org.companies
- `mdata.load_stops` — Operational master data — loads, stops, drivers, units, equipment, customers, vendors — load stops · out→2 in←9 · wired · →mdata.loads, mdata.locations
- `mdata.loads` — Operational master data — loads, stops, drivers, units, equipment, customers, vendors — loads · out→7 in←59 · wired · →docs.files, identity.users, mdata.customers, mdata.driver_teams, mdata.drivers, mdata.units, org.companies
- `mdata.location_contacts` — Operational master data — loads, stops, drivers, units, equipment, customers, vendors — location contacts · out→3 in←0 · leaf · →identity.users, mdata.locations, org.companies
- `mdata.locations` — Operational master data — loads, stops, drivers, units, equipment, customers, vendors — locations · out→4 in←4 · wired · →identity.users, mdata.customers, mdata.vendors, org.companies
- `mdata.maintenance_parts` — Operational master data — loads, stops, drivers, units, equipment, customers, vendors — maintenance parts · out→1 in←0 · leaf · →org.companies
- `mdata.maintenance_services` — Operational master data — loads, stops, drivers, units, equipment, customers, vendors — maintenance services · out→1 in←0 · leaf · →org.companies
- `mdata.mx_permits` — Operational master data — loads, stops, drivers, units, equipment, customers, vendors — mx permits · out→3 in←0 · leaf · →mdata.drivers, mdata.units, org.companies
- `mdata.mx_tolls_ledger` — Operational master data — loads, stops, drivers, units, equipment, customers, vendors — mx tolls ledger · out→4 in←0 · leaf · →?.loads, mdata.drivers, mdata.units, org.companies
- `mdata.qbo_accounts` — Operational master data — loads, stops, drivers, units, equipment, customers, vendors — qbo accounts · out→1 in←0 · leaf · →org.companies
- `mdata.qbo_ap_bills` — Operational master data — loads, stops, drivers, units, equipment, customers, vendors — qbo ap bills · out→1 in←0 · leaf · →org.companies
- `mdata.qbo_bills` — Operational master data — loads, stops, drivers, units, equipment, customers, vendors — qbo bills · out→2 in←0 · leaf · →accounting.bills, org.companies
- `mdata.qbo_classes` — Operational master data — loads, stops, drivers, units, equipment, customers, vendors — qbo classes · out→1 in←0 · leaf · →org.companies
- `mdata.qbo_customers` — Operational master data — loads, stops, drivers, units, equipment, customers, vendors — qbo customers · out→1 in←0 · leaf · →org.companies
- `mdata.qbo_invoices` — Operational master data — loads, stops, drivers, units, equipment, customers, vendors — qbo invoices · out→2 in←0 · leaf · →accounting.invoices, org.companies
- `mdata.qbo_items` — Operational master data — loads, stops, drivers, units, equipment, customers, vendors — qbo items · out→1 in←0 · leaf · →org.companies
- `mdata.qbo_sync_runs` — Operational master data — loads, stops, drivers, units, equipment, customers, vendors — qbo sync runs · out→1 in←0 · leaf · →org.companies
- `mdata.qbo_vendors` — Operational master data — loads, stops, drivers, units, equipment, customers, vendors — qbo vendors · out→2 in←2 · wired · →?.a, org.companies
- `mdata.unit_border_crossings` — Operational master data — loads, stops, drivers, units, equipment, customers, vendors — unit border crossings · out→4 in←0 · leaf · →mdata.units, mdata.vendors, org.companies, reference.ports_of_entry
- `mdata.unit_photos` — Operational master data — loads, stops, drivers, units, equipment, customers, vendors — unit photos · out→2 in←0 · leaf · →mdata.units, org.companies
- `mdata.unit_plates` — Operational master data — loads, stops, drivers, units, equipment, customers, vendors — unit plates · out→2 in←0 · leaf · →mdata.units, org.companies
- `mdata.units` — Operational master data — loads, stops, drivers, units, equipment, customers, vendors — units · out→3 in←67 · wired · →identity.users, mdata.drivers, org.companies
- `mdata.vendors` — Operational master data — loads, stops, drivers, units, equipment, customers, vendors — vendors · out→2 in←18 · wired · →identity.users, org.companies
- `mdata.workflow_requests` — Operational master data — loads, stops, drivers, units, equipment, customers, vendors — workflow requests · out→1 in←0 · leaf · →identity.users

### migration  (5)
- `migration.block6_demo_purge_ledger` — migration — block6 demo purge ledger · out→0 in←0 · island(by-design)
- `migration.test_seed_archive_ledger_0320` — migration — test seed archive ledger 0320 · out→0 in←0 · island(by-design)
- `migration.test_seed_archive_ledger_0367` — migration — test seed archive ledger 0367 · out→0 in←0 · island(by-design)
- `migration.test_seed_archive_ledger_0369` — migration — test seed archive ledger 0369 · out→0 in←0 · island(by-design)
- `migration.test_seed_archive_ledger_0396` — migration — test seed archive ledger 0396 · out→0 in←0 · island(by-design)

### notifications  (2)
- `notifications.user_notification_preferences` — notifications — user notification preferences · out→3 in←0 · leaf · →?.enable, ?.for, ?.to
- `notifications.user_notifications` — notifications — user notifications · out→1 in←0 · leaf · →org.companies

### onboarding  (1)
- `onboarding.onboarding_state` — onboarding — onboarding state · out→1 in←0 · leaf · →org.companies

### ops  (6)
- `ops.audit_chain_verifications` — Operational ops tooling — audit chain verifications · out→0 in←0 · island(by-design)
- `ops.daily_task_alerts` — Operational ops tooling — daily task alerts · out→3 in←0 · leaf · →identity.users, ops.daily_tasks, org.companies
- `ops.daily_task_events` — Operational ops tooling — daily task events · out→3 in←0 · leaf · →identity.users, ops.daily_tasks, org.companies
- `ops.daily_tasks` — Operational ops tooling — daily tasks · out→2 in←2 · wired · →identity.users, org.companies
- `ops.load_test_runs` — Operational ops tooling — load test runs · out→1 in←0 · leaf · →org.companies
- `ops.program_board_notes` — Operational ops tooling — program board notes · out→0 in←0 · ★ISLAND-VERIFY

### org  (2)
- `org.companies` — Organization / companies (multi-entity) — companies · out→0 in←385 · root/ref
- `org.user_company_access` — Organization / companies (multi-entity) — user company access · out→2 in←0 · leaf · →identity.users, org.companies

### outbox  (3)
- `outbox.events` — outbox — events · out→0 in←0 · island(by-design)
- `outbox.outbox_queue` — outbox — outbox queue · out→0 in←0 · island(by-design)
- `outbox.queue` — outbox — queue · out→0 in←0 · island(by-design)

### owner  (1)
- `owner.todays_attention_snapshot` — owner — todays attention snapshot · out→0 in←0 · island(by-design)

### payroll  (2)
- `payroll.driver_settlement_line_items` — Payroll (RETIRED — do not build on) — driver settlement line items · out→6 in←0 · leaf · →catalogs.accounts, driver_finance.auto_deduction_policies, mdata.drivers, mdata.loads, org.companies, payroll.driver_settlements
- `payroll.driver_settlements` — Payroll (RETIRED — do not build on) — driver settlements · out→5 in←1 · wired · →accounting.bill_payments, accounting.bills, identity.users, mdata.drivers, org.companies

### payroll_integration  (1)
- `payroll_integration.aggregate_cache` — payroll_integration — aggregate cache · out→1 in←0 · leaf · →org.companies

### public  (4)
- `public.audit_log` — Default/public schema (misc) — audit log · out→0 in←0 · island(by-design)
- `public.audit_log_partitioned` — Default/public schema (misc) — audit log partitioned · out→0 in←0 · island(by-design)
- `public.idempotency_keys` — Default/public schema (misc) — idempotency keys · out→0 in←0 · island(by-design)
- `public.partition_maintenance_log` — Default/public schema (misc) — partition maintenance log · out→0 in←0 · island(by-design)

### qbo  (5)
- `qbo.bill_payment_mappings` — QuickBooks live sync state & mirror — bill payment mappings · out→1 in←0 · leaf · →org.companies
- `qbo.reconciliation_alerts` — QuickBooks live sync state & mirror — reconciliation alerts · out→0 in←0 · ★ISLAND-VERIFY
- `qbo.sync_alerts` — QuickBooks live sync state & mirror — sync alerts · out→1 in←0 · leaf · →org.companies
- `qbo.sync_dead_letter_email_throttle` — QuickBooks live sync state & mirror — sync dead letter email throttle · out→1 in←0 · leaf · →org.companies
- `qbo.sync_runs` — QuickBooks live sync state & mirror — sync runs · out→1 in←0 · leaf · →org.companies

### qbo_archive  (6)
- `qbo_archive.attachments_snapshot` — QuickBooks archived/cloned data (system-of-record clone) — attachments snapshot · out→3 in←0 · leaf · →org.companies, qbo_archive.import_batches, qbo_archive.transactions_snapshot
- `qbo_archive.entities_snapshot` — QuickBooks archived/cloned data (system-of-record clone) — entities snapshot · out→2 in←0 · leaf · →org.companies, qbo_archive.import_batches
- `qbo_archive.forensic_anomalies` — QuickBooks archived/cloned data (system-of-record clone) — forensic anomalies · out→4 in←0 · leaf · →identity.users, org.companies, qbo_archive.import_batches, qbo_archive.transactions_snapshot
- `qbo_archive.import_batch_audit_log` — QuickBooks archived/cloned data (system-of-record clone) — import batch audit log · out→2 in←0 · leaf · →org.companies, qbo_archive.import_batches
- `qbo_archive.import_batches` — QuickBooks archived/cloned data (system-of-record clone) — import batches · out→2 in←5 · wired · →identity.users, org.companies
- `qbo_archive.transactions_snapshot` — QuickBooks archived/cloned data (system-of-record clone) — transactions snapshot · out→2 in←2 · wired · →org.companies, qbo_archive.import_batches

### qbo_sync  (2)
- `qbo_sync.drift_alert_throttle` — qbo_sync — drift alert throttle · out→1 in←0 · leaf · →org.companies
- `qbo_sync.drift_log` — qbo_sync — drift log · out→1 in←0 · leaf · →org.companies

### reference  (3)
- `reference.cbp_wait_times_cache` — Static reference data (codes, enums-as-tables) — cbp wait times cache · out→0 in←0 · island(by-design)
- `reference.oem_parts` — Static reference data (codes, enums-as-tables) — oem parts · out→0 in←0 · ★ISLAND-VERIFY
- `reference.ports_of_entry` — Static reference data (codes, enums-as-tables) — ports of entry · out→0 in←1 · root/ref

### reporting  (2)
- `reporting.scheduled_report_runs` — reporting — scheduled report runs · out→3 in←0 · leaf · →email.email_queue, org.companies, reporting.scheduled_reports
- `reporting.scheduled_reports` — reporting — scheduled reports · out→2 in←1 · wired · →identity.users, org.companies

### reports  (8)
- `reports.custom_report_definitions` — Reporting engine — saved reports, refresh state — custom report definitions · out→2 in←0 · leaf · →identity.users, org.companies
- `reports.deadhead_cache` — Reporting engine — saved reports, refresh state — deadhead cache · out→1 in←0 · leaf · →org.companies
- `reports.ifta_filings` — Reporting engine — saved reports, refresh state — ifta filings · out→2 in←0 · leaf · →identity.users, org.companies
- `reports.lane_profitability_cache` — Reporting engine — saved reports, refresh state — lane profitability cache · out→1 in←0 · leaf · →org.companies
- `reports.run_log` — Reporting engine — saved reports, refresh state — run log · out→2 in←0 · leaf · →identity.users, org.companies
- `reports.scheduled_delivery_log` — Reporting engine — saved reports, refresh state — scheduled delivery log · out→1 in←0 · leaf · →reports.scheduled_subscriptions
- `reports.scheduled_reports` — Reporting engine — saved reports, refresh state — scheduled reports · out→1 in←0 · leaf · →org.companies
- `reports.scheduled_subscriptions` — Reporting engine — saved reports, refresh state — scheduled subscriptions · out→0 in←1 · root/ref

### safety  (55)
- `safety.accident_reports` — Safety & compliance events — incidents, accidents, fines (civil+internal), violations, drug/alcohol — accident reports · out→3 in←0 · leaf · →mdata.loads, mdata.units, mdata.vendors
- `safety.anomaly_alert_rules` — Safety & compliance events — incidents, accidents, fines (civil+internal), violations, drug/alcohol — anomaly alert rules · out→0 in←1 · root/ref
- `safety.anomaly_alerts` — Safety & compliance events — incidents, accidents, fines (civil+internal), violations, drug/alcohol — anomaly alerts · out→1 in←0 · leaf · →safety.anomaly_alert_rules
- `safety.background_checks` — Safety & compliance events — incidents, accidents, fines (civil+internal), violations, drug/alcohol — background checks · out→1 in←0 · leaf · →org.companies
- `safety.clearinghouse_query` — Safety & compliance events — incidents, accidents, fines (civil+internal), violations, drug/alcohol — clearinghouse query · out→2 in←0 · leaf · →mdata.drivers, org.companies
- `safety.company_violations` — Safety & compliance events — incidents, accidents, fines (civil+internal), violations, drug/alcohol — company violations · out→5 in←0 · leaf · →catalogs.company_violation_types, docs.files, identity.users, org.companies, safety.internal_fines
- `safety.complaints` — Safety & compliance events — incidents, accidents, fines (civil+internal), violations, drug/alcohol — complaints · out→5 in←0 · leaf · →catalogs.complaint_types, identity.users, mdata.customers, mdata.drivers, org.companies
- `safety.compliance_reminders` — Safety & compliance events — incidents, accidents, fines (civil+internal), violations, drug/alcohol — compliance reminders · out→1 in←0 · leaf · →org.companies
- `safety.csa_scores` — Safety & compliance events — incidents, accidents, fines (civil+internal), violations, drug/alcohol — csa scores · out→1 in←0 · leaf · →org.companies
- `safety.da_program_enrollments` — Safety & compliance events — incidents, accidents, fines (civil+internal), violations, drug/alcohol — da program enrollments · out→1 in←0 · leaf · →mdata.drivers
- `safety.da_random_pool_draws` — Safety & compliance events — incidents, accidents, fines (civil+internal), violations, drug/alcohol — da random pool draws · out→0 in←0 · island(by-design)
- `safety.da_test_records` — Safety & compliance events — incidents, accidents, fines (civil+internal), violations, drug/alcohol — da test records · out→1 in←0 · leaf · →mdata.drivers
- `safety.damage_continuity_chains` — Safety & compliance events — incidents, accidents, fines (civil+internal), violations, drug/alcohol — damage continuity chains · out→2 in←0 · leaf · →org.companies, safety.incidents
- `safety.document_alert_events` — Safety & compliance events — incidents, accidents, fines (civil+internal), violations, drug/alcohol — document alert events · out→3 in←0 · leaf · →identity.users, org.companies, safety.document_alert_rules
- `safety.document_alert_rules` — Safety & compliance events — incidents, accidents, fines (civil+internal), violations, drug/alcohol — document alert rules · out→1 in←1 · wired · →org.companies
- `safety.dot_inspections` — Safety & compliance events — incidents, accidents, fines (civil+internal), violations, drug/alcohol — dot inspections · out→5 in←1 · wired · →identity.users, maintenance.work_orders, mdata.drivers, mdata.units, org.companies
- `safety.driver_documents` — Safety & compliance events — incidents, accidents, fines (civil+internal), violations, drug/alcohol — driver documents · out→1 in←0 · leaf · →org.companies
- `safety.driver_leave_audit_log` — Safety & compliance events — incidents, accidents, fines (civil+internal), violations, drug/alcohol — driver leave audit log · out→3 in←0 · leaf · →identity.users, org.companies, safety.driver_leave_requests
- `safety.driver_leave_days` — Safety & compliance events — incidents, accidents, fines (civil+internal), violations, drug/alcohol — driver leave days · out→4 in←0 · leaf · →identity.users, mdata.drivers, org.companies, safety.driver_leave_requests
- `safety.driver_leave_requests` — Safety & compliance events — incidents, accidents, fines (civil+internal), violations, drug/alcohol — driver leave requests · out→4 in←3 · wired · →documents.attachments, identity.users, mdata.drivers, org.companies
- `safety.driver_qualification_files` — Safety & compliance events — incidents, accidents, fines (civil+internal), violations, drug/alcohol — driver qualification files · out→1 in←0 · leaf · →org.companies
- `safety.driver_safety_profiles` — Safety & compliance events — incidents, accidents, fines (civil+internal), violations, drug/alcohol — driver safety profiles · out→1 in←0 · leaf · →org.companies
- `safety.driver_safety_scores` — Safety & compliance events — incidents, accidents, fines (civil+internal), violations, drug/alcohol — driver safety scores · out→2 in←0 · leaf · →mdata.drivers, org.companies
- `safety.driver_w8ben` — Safety & compliance events — incidents, accidents, fines (civil+internal), violations, drug/alcohol — driver w8ben · out→1 in←0 · leaf · →org.companies
- `safety.drug_pool_selections` — Safety & compliance events — incidents, accidents, fines (civil+internal), violations, drug/alcohol — drug pool selections · out→1 in←0 · leaf · →org.companies
- `safety.drug_test` — Safety & compliance events — incidents, accidents, fines (civil+internal), violations, drug/alcohol — drug test · out→2 in←2 · wired · →mdata.drivers, org.companies
- `safety.dvir_defect_severity_tags` — Safety & compliance events — incidents, accidents, fines (civil+internal), violations, drug/alcohol — dvir defect severity tags · out→4 in←0 · leaf · →identity.users, maintenance.work_orders, org.companies, safety.dvir_defects
- `safety.dvir_defects` — Safety & compliance events — incidents, accidents, fines (civil+internal), violations, drug/alcohol — dvir defects · out→4 in←1 · wired · →maintenance.work_orders, mdata.units, org.companies, safety.dvir_submissions
- `safety.dvir_submissions` — Safety & compliance events — incidents, accidents, fines (civil+internal), violations, drug/alcohol — dvir submissions · out→5 in←2 · wired · →maintenance.work_orders, mdata.drivers, mdata.loads, mdata.units, org.companies
- `safety.fines` — Safety & compliance events — incidents, accidents, fines (civil+internal), violations, drug/alcohol — fines · out→7 in←0 · leaf · →docs.files, driver_finance.driver_liabilities, identity.users, mdata.drivers, mdata.loads, mdata.units, org.companies
- `safety.fuel_gps_matches` — Safety & compliance events — incidents, accidents, fines (civil+internal), violations, drug/alcohol — fuel gps matches · out→3 in←0 · leaf · →banking.bank_transactions, mdata.units, org.companies
- `safety.geofence_breach_events` — Safety & compliance events — incidents, accidents, fines (civil+internal), violations, drug/alcohol — geofence breach events · out→5 in←0 · leaf · →geo.geofences, identity.users, mdata.customers, mdata.units, org.companies
- `safety.harsh_events` — Safety & compliance events — incidents, accidents, fines (civil+internal), violations, drug/alcohol — harsh events · out→3 in←1 · wired · →mdata.drivers, mdata.units, org.companies
- `safety.hos_exceptions` — Safety & compliance events — incidents, accidents, fines (civil+internal), violations, drug/alcohol — hos exceptions · out→1 in←0 · leaf · →org.companies
- `safety.hos_violations` — Safety & compliance events — incidents, accidents, fines (civil+internal), violations, drug/alcohol — hos violations · out→5 in←0 · leaf · →identity.users, mdata.drivers, mdata.loads, org.companies, safety.dot_inspections
- `safety.incidents` — Safety & compliance events — incidents, accidents, fines (civil+internal), violations, drug/alcohol — incidents · out→6 in←3 · wired · →mdata.customers, mdata.drivers, mdata.equipment, mdata.loads, mdata.units, org.companies
- `safety.integrity_alert_events` — Safety & compliance events — incidents, accidents, fines (civil+internal), violations, drug/alcohol — integrity alert events · out→4 in←1 · wired · →identity.users, org.companies, safety.integrity_alert_rules, safety.integrity_alerts
- `safety.integrity_alert_rules` — Safety & compliance events — incidents, accidents, fines (civil+internal), violations, drug/alcohol — integrity alert rules · out→2 in←2 · wired · →identity.users, org.companies
- `safety.integrity_alerts` — Safety & compliance events — incidents, accidents, fines (civil+internal), violations, drug/alcohol — integrity alerts · out→7 in←1 · wired · →identity.users, mdata.drivers, mdata.units, mdata.vendors, org.companies, safety.integrity_alert_events, safety.integrity_alert_rules
- `safety.integrity_findings` — Safety & compliance events — incidents, accidents, fines (civil+internal), violations, drug/alcohol — integrity findings · out→0 in←0 · ★ISLAND-VERIFY
- `safety.integrity_observations` — Safety & compliance events — incidents, accidents, fines (civil+internal), violations, drug/alcohol — integrity observations · out→2 in←0 · leaf · →identity.users, org.companies
- `safety.internal_fines` — Safety & compliance events — incidents, accidents, fines (civil+internal), violations, drug/alcohol — internal fines · out→5 in←1 · wired · →catalogs.internal_fine_reasons, identity.users, mdata.drivers, mdata.loads, org.companies
- `safety.medical_cards` — Safety & compliance events — incidents, accidents, fines (civil+internal), violations, drug/alcohol — medical cards · out→1 in←0 · leaf · →org.companies
- `safety.onboarding_sessions` — Safety & compliance events — incidents, accidents, fines (civil+internal), violations, drug/alcohol — onboarding sessions · out→3 in←1 · wired · →identity.users, mdata.drivers, org.companies
- `safety.permit_renewal_reminders` — Safety & compliance events — incidents, accidents, fines (civil+internal), violations, drug/alcohol — permit renewal reminders · out→1 in←0 · leaf · →org.companies
- `safety.permits` — Safety & compliance events — incidents, accidents, fines (civil+internal), violations, drug/alcohol — permits · out→3 in←0 · leaf · →identity.users, mdata.units, org.companies
- `safety.photo_comparison_sessions` — Safety & compliance events — incidents, accidents, fines (civil+internal), violations, drug/alcohol — photo comparison sessions · out→2 in←0 · leaf · →org.companies, safety.incidents
- `safety.random_pool` — Safety & compliance events — incidents, accidents, fines (civil+internal), violations, drug/alcohol — random pool · out→3 in←0 · leaf · →mdata.drivers, org.companies, safety.drug_test
- `safety.rtd_case` — Safety & compliance events — incidents, accidents, fines (civil+internal), violations, drug/alcohol — rtd case · out→3 in←0 · leaf · →mdata.drivers, org.companies, safety.drug_test
- `safety.safety_event_notes` — Safety & compliance events — incidents, accidents, fines (civil+internal), violations, drug/alcohol — safety event notes · out→3 in←0 · leaf · →identity.users, org.companies, safety.safety_events
- `safety.safety_events` — Safety & compliance events — incidents, accidents, fines (civil+internal), violations, drug/alcohol — safety events · out→5 in←1 · wired · →identity.users, mdata.drivers, mdata.loads, mdata.units, org.companies
- `safety.safety_settings` — Safety & compliance events — incidents, accidents, fines (civil+internal), violations, drug/alcohol — safety settings · out→2 in←0 · leaf · →identity.users, org.companies
- `safety.temp_unit_assignments` — Safety & compliance events — incidents, accidents, fines (civil+internal), violations, drug/alcohol — temp unit assignments · out→5 in←0 · leaf · →identity.users, mdata.drivers, mdata.units, org.companies, safety.driver_leave_requests
- `safety.training_programs` — Safety & compliance events — incidents, accidents, fines (civil+internal), violations, drug/alcohol — training programs · out→1 in←0 · leaf · →org.companies
- `safety.training_records` — Safety & compliance events — incidents, accidents, fines (civil+internal), violations, drug/alcohol — training records · out→1 in←0 · leaf · →org.companies

### safetydoc  (2)
- `safetydoc.assignment` — safetydoc — assignment · out→1 in←0 · leaf · →safetydoc.document
- `safetydoc.document` — safetydoc — document · out→0 in←1 · root/ref

### samsara  (2)
- `samsara.hos_snapshots` — samsara — hos snapshots · out→3 in←0 · leaf · →mdata.drivers, mdata.units, org.companies
- `samsara.vehicle_state_miles` — samsara — vehicle state miles · out→2 in←0 · leaf · →mdata.units, org.companies

### search  (1)
- `search.universal_index` — search — universal index · out→0 in←0 · island(by-design)

### settlement  (3)
- `settlement.settlement` — Settlement (RETIRED — canonical is driver_finance) — settlement · out→3 in←4 · wired · →identity.users, mdata.drivers, org.companies
- `settlement.settlement_deduction` — Settlement (RETIRED — canonical is driver_finance) — settlement deduction · out→3 in←0 · leaf · →mdata.drivers, org.companies, settlement.settlement
- `settlement.settlement_line` — Settlement (RETIRED — canonical is driver_finance) — settlement line · out→5 in←2 · wired · →identity.users, mdata.drivers, mdata.loads, org.companies, settlement.settlement

### settlements  (3)
- `settlements.settlement_disputes` — settlements — settlement disputes · out→3 in←0 · leaf · →driver_finance.driver_settlements, identity.users, mdata.drivers
- `settlements.team_split_configs` — settlements — team split configs · out→3 in←0 · leaf · →identity.users, mdata.drivers, org.companies
- `settlements.team_split_load_overrides` — settlements — team split load overrides · out→4 in←0 · leaf · →identity.users, mdata.drivers, mdata.loads, org.companies

### shipper_portal  (4)
- `shipper_portal.load_milestones` — Customer/shipper portal — load milestones · out→1 in←0 · leaf · →org.companies
- `shipper_portal.portal_password_reset_tokens` — Customer/shipper portal — portal password reset tokens · out→1 in←0 · leaf · →shipper_portal.portal_users
- `shipper_portal.portal_sessions` — Customer/shipper portal — portal sessions · out→1 in←0 · leaf · →shipper_portal.portal_users
- `shipper_portal.portal_users` — Customer/shipper portal — portal users · out→2 in←2 · wired · →mdata.customers, org.companies

### sms  (1)
- `sms.queue` — sms — queue · out→1 in←0 · leaf · →org.companies

### tasks  (8)
- `tasks.note` — Task planner — tasks, links, alarms — note · out→1 in←0 · leaf · →tasks.task
- `tasks.status_history` — Task planner — tasks, links, alarms — status history · out→1 in←0 · leaf · →tasks.task
- `tasks.task` — Task planner — tasks, links, alarms — task · out→1 in←5 · wired · →tasks.task_type
- `tasks.task_activity` — Task planner — tasks, links, alarms — task activity · out→1 in←0 · leaf · →tasks.task
- `tasks.task_comments` — Task planner — tasks, links, alarms — task comments · out→1 in←0 · leaf · →tasks.task
- `tasks.task_link` — Task planner — tasks, links, alarms — task link · out→1 in←0 · leaf · →tasks.task
- `tasks.task_type` — Task planner — tasks, links, alarms — task type · out→0 in←1 · root/ref
- `tasks.task_type_seed` — Task planner — tasks, links, alarms — task type seed · out→0 in←0 · island(by-design)

### telematics  (4)
- `telematics.dashcam_clips` — Telematics ingest — GPS, engine states, HOS feed — dashcam clips · out→3 in←0 · leaf · →mdata.units, org.companies, safety.harsh_events
- `telematics.vehicle_driver_assignments` — Telematics ingest — GPS, engine states, HOS feed — vehicle driver assignments · out→5 in←1 · wired · →identity.users, integrations.samsara_webhook_events, mdata.drivers, mdata.units, org.companies
- `telematics.vehicle_driver_pairing_overlap_flags` — Telematics ingest — GPS, engine states, HOS feed — vehicle driver pairing overlap flags · out→4 in←0 · leaf · →mdata.drivers, mdata.units, org.companies, telematics.vehicle_driver_assignments
- `telematics.vehicle_locations` — Telematics ingest — GPS, engine states, HOS feed — vehicle locations · out→2 in←0 · leaf · →mdata.units, org.companies

### usmca_ops  (2)
- `usmca_ops.activation_audit` — usmca_ops — activation audit · out→1 in←0 · leaf · →identity.users
- `usmca_ops.activation_state` — usmca_ops — activation state · out→1 in←0 · leaf · →identity.users

### utilization  (2)
- `utilization.driver_period` — utilization — driver period · out→0 in←0 · ★ISLAND-VERIFY
- `utilization.unit_period` — utilization — unit period · out→0 in←0 · ★ISLAND-VERIFY

### whatsapp  (1)
- `whatsapp.queue` — whatsapp — queue · out→1 in←0 · leaf · →org.companies