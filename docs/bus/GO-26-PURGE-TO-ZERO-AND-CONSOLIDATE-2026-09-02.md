# GO-26 — PURGE USMCA TO ZERO · CONSOLIDATE THE DUPLICATE COMPONENTS
**Owner order, 2026-09-02.** Verified live against `br-fancy-credit-akjnd07a` under `SET LOCAL app.bypass_rls = 'lucia'`.

> **THE ORDER, VERBATIM:**
> *"we do not need sample drivers. i asked and ordered to delete every single test, sample, demo, probe, hop transaction. the usmca software should not have a single transaction existing in the entire system. all should show 0. blank. only bank transactions should appear uncategorized since december 2025."*
>
> *"lets consolidate so they all get fixed at once."*

---

# PART 1 — USMCA IS NOT BLANK

The purge that ran earlier covered loads and journal entries only. A full sweep of every entity-scoped table finds **roughly 900 transaction rows still alive across ~70 tables.**

## 1.1 · THE BIG ONES

| Table | USMCA rows | What it is |
|---|---:|---|
| `dispatch.load_id_reservations` | **5,875** | **Burned load numbers.** Every probe that opened Book Load reserved one. This is why the counter is nowhere near your real numbering |
| `accounting.posting_batches` | **607** | Posting runs from test transactions |
| `banking.reconciliation_matches` | **118** | Matches against fixtures |
| `accounting.recon_runs` | **66** | Reconciliation runs |
| `accounting.outbox_events` | **43** | Queued events from test writes |
| `accounting.escrow_accounts` | **21** | You ruled escrow WIPED. Still here |
| `accounting.prepaid_amortization_rows` | **15** | |
| `driver_finance.driver_advance_accounts` | **12** | |
| `accounting.escrow_postings` | **6** | You ruled escrow WIPED. Still here |
| `driver_finance.driver_liabilities` | **5** | |
| `dispatch.border_crossing_events` | **5** | |

## 1.2 · THE 2-TO-4 ROW TABLES

`factoring.batch` 4 · `accounting.cash_flow_adjustments` 4 · `driver_finance.deduction_schedule` 4 · `banking.reconciliation_drift_alerts` 4 · `banking.transfers` 3 · `driver_finance.settlement_payment_events` 3 · `driver_finance.escrow_ledger` 3 · `driver_finance.escrow_balances` 3 · `banking.reconciliation_sessions` 3 · `fuel.fuel_transactions` 3 · `accounting.lease_contract` 2 · `accounting.prepaid_assets` 2 · `driver_finance.driver_settlement_deductions` 2 · `accounting.lease_classification` 2 · `banking.bank_transaction_splits` 2 · `dispatch.intransit_issues` 2 · `accounting.parts_purchase_postings` 2

## 1.3 · THE ONE-ROW TABLES — the probe signature

Thirty-plus tables holding **exactly one row each**. That is what a probe leaves behind: someone called the endpoint once to see if it worked.

`accounting.revenue_contracts` · `revenue_obligations` · `revenue_recognition_rows` · `factoring_advances` · `factoring_reserve_movements` · `factoring_default_interest_accruals` · `related_party_loan_entries` · `related_party_loan_schedule` · `property_tax_accruals` · `warranty_reimburse_postings` · `civil_fine_postings` · `insurance_claim_recovery_postings` · `sales_tax_returns` · `tax_document` · `tax_document_batch` · `ap_import_batches` · `ap_import_preview_lines` · `ob_register_staging_lines` · `ob_register_audit_events` · `ob_source_finality` · `period_cash_basis_snapshot` · `recon_exceptions` · `recurring_templates` · `recurring_bill_templates` · `vendor_payment_methods` · `driver_finance.driver_reimbursements` · `driver_deduction_buckets` · `driver_deduction_bucket_events` · `trip_link_queue` · `abandonment_defaults` · `dispatch.stop_arrivals` · `ocr_intake_queue` · `ratecon_extractions` · `equipment_transfer_requests` · `customer_notify_preferences` · `banking.intercompany_transfer_groups` · `fuel.fraud_alerts` · `fuel.loves_prices_daily`

---

# PART 2 — WHAT STAYS

Not everything with rows is a transaction. **Do not touch these.** Zeroing a config table breaks the software.

| Keep | Rows | Why |
|---|---:|---|
| `banking.bank_transactions` | **395** | **The owner's explicit exception.** Real Plaid feed, uncategorized, December 2025 forward |
| `banking.bank_accounts` | 5 | Account setup |
| `accounting.qbo_accounts` | 365 | Chart of accounts mirror |
| `accounting.chart_of_accounts_roles` | 49 | Role mapping |
| `accounting.expense_category_account_map` | 33 | Category to GL mapping |
| `accounting.periods` | 24 | Accounting calendar |
| `accounting.fixed_asset_classes` | 4 | Depreciation config |
| `banking.transaction_categories` | 4 | Categorization catalog |
| `accounting.sales_tax_agencies` · `vendor_classifications` · `customer_classifications` · `banking_rules` · `cash_forecast_settings` · `settlement_posting_config` | 1 each | Config |
| `driver_finance.driver_pay_rates` | 91 | Driver pay setup |
| `driver_finance.escrow_settings` · `auto_deduction_policies` · `settlement_contract_terms_config` | 1 each | Policy config |
| `factoring.customer_factor_assignment` | 1,221 | Customer factoring setup |
| `factoring.factor` | 1 | Faro Factoring — real partner |
| `fuel.fuel_planner_settings` · `fuel_card_overage_policies` | 1 each | Config |
| `banking.intercompany_entity_pairs` | 2 | Entity mapping |
| `telematics.vehicle_locations` | 40,572 | GPS history, not a transaction |
| `telematics.vehicle_driver_assignments` | 55 | Assignment history |

**Three that need one ruling before they move** — they read as config but sit in a money chain:
`accounting.escrow_accounts` (21) · `driver_finance.driver_advance_accounts` (12) · `driver_finance.escrow_balances` (3).
Your CPA answer says each driver automatically gets an asset and a liability account when hired, as a sub-account. If these 36 rows are those per-driver accounts for real drivers, they are **config and they stay**. If they were created by probes, they go. **CC-1 reports which, does not guess.**

---

# PART 3 — THE PURGE RULES

> **AMENDED 2026-09-02 (owner ruling — seat blocks win):** Method is **VOID FIRST, THEN DELETE.** Both. Never skip void; never stop at void. Rule 1 below ("Delete, do not void") is **superseded** by `GO-26-SEAT-BLOCKS-PURGE-AND-CONSOLIDATE.md`. The void writes the register; the delete gets you to zero.

1. ~~**Delete, do not void.**~~ **SUPERSEDED — see amendment above.** The void register exists to protect **real** money — a fixture has no audit trail worth keeping. This does not weaken the standing law; it draws the line the law always assumed. A real transaction is never deleted. A fixture is never kept.
2. **`is_sample_data` is not the filter.** `banking.bank_transactions` has the column and **zero rows are flagged** even though 34 fakes were identified. The flag was never written. **Filter on the truth: does this row belong to a real, owner-entered transaction? In USMCA today the answer is no for every one of them, because you have entered exactly one load and zero money.**
3. **Order matters — children before parents.** Postings before batches, lines before headers, matches before sessions, splits before transactions. A delete that trips an FK means the order was wrong, not that the row should stay.
4. **`dispatch.load_id_reservations` — reset, do not just delete.** After clearing, reseed `lib.trace_counters` so the next load number is **13509** (load **13508** stays; August one-sheet series starts at 13508). Clearing 5,875 reservations without reseeding the counter leaves the next number wrong.
5. **Escrow — the owner already ruled it WIPED.** `escrow_ledger`, `escrow_postings`, and any escrow balance goes to zero. This closes the item the 2026-09-01 register called the most serious thing on the list.
6. **One PR per schema**, in this order: `accounting` → `driver_finance` → `banking` → `factoring` → `dispatch` → `fuel`. Migration lane rules apply.
7. **Proof is a re-run of the sweep**, pasted before and after. Not a description.

## The done-gate — paste this exact query and every row must read 0

```sql
SET LOCAL app.bypass_rls = 'lucia';
SELECT tbl, n FROM (
  SELECT c.table_schema||'.'||c.table_name AS tbl,
    COALESCE((xpath('/row/cnt/text()', query_to_xml(format(
      'SELECT count(*) AS cnt FROM %I.%I WHERE operating_company_id::text = ''5c854333-6ea5-4faa-af31-67cb272fef80''',
      c.table_schema, c.table_name), false, true, '')))[1]::text, '0') AS n
  FROM information_schema.columns c
  JOIN information_schema.tables t
    ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
  WHERE c.column_name = 'operating_company_id' AND c.udt_name = 'uuid'
    AND c.table_schema IN ('accounting','driver_finance','banking','factoring','dispatch','fuel','telematics')
) s
WHERE n <> '0'
ORDER BY n::bigint DESC;
```

**After the purge the ONLY rows this may return are the PART 2 keep-list.** Anything else means the purge is not done.

## Also to zero

- **2 sample drivers** in `mdata.drivers` where `is_sample_data = true`. The owner has ruled: delete. They are not needed.
- **Load `13508` stays.** It is real, `is_sample_data = false`, owner-entered. Do not touch it.

---

# PART 4 — CONSOLIDATE, SO ONE FIX REACHES EVERY SCREEN

The owner's ruling: **one component per job. Retire the duplicates.**

This is the root cause behind three separate registers of defects. A fix lands on one copy and the other three keep shipping the bug. K2 is the proof — the outside-click fix landed on `components/Combobox.tsx` and the wizard has never imported that file.

## 4.1 · TABLES — keep `ParityTable`, retire three

| Component | Files | Verdict |
|---|---:|---|
| `components/parity/ParityTable.tsx` | 373 | **KEEP.** Has drag-resize, drag-reorder, auto-fit, persists per table |
| `components/DataTable.tsx` | — | **RETIRE** |
| `components/shared/ResizableTable.tsx` | — | **RETIRE** |
| `components/shared/MobileOptimizedTable.tsx` | — | **RETIRE** |
| raw `<table>` | **43 files** | **CONVERT** — these can never drag or resize |

**Stop rule:** financial statements (Balance Sheet, P&L, Trial Balance, Cash Flow) carry indented section rows and subtotals. If `ParityTable` cannot express a subtotal row, **say so and stop on that file.** Do not flatten a financial statement into a flat grid to make it fit.

## 4.2 · PICKERS — keep `components/Combobox`, retire three

| Component | Files importing | Dismisses on outside click | Verdict |
|---|---:|---|---|
| `components/Combobox.tsx` | 43 | **YES** | **KEEP** |
| `components/shared/SelectCombobox.tsx` | **158** | No | **RETIRE** |
| `components/parity/EntityPicker.tsx` | **111** | No | **RETIRE** |
| `components/shared/Combobox.tsx` | 8 | No | **RETIRE** |

**277 files trap the operator today, up from 268 while this row sat assigned.** The count is rising because nothing stops a new screen importing a retired picker.

## 4.3 · THE ORDER — guard first, then migrate

**Guard on day one, before a single conversion.** A CI check that fails on:
- any new import of `DataTable`, `ResizableTable`, `MobileOptimizedTable`, `SelectCombobox`, `EntityPicker`, `shared/Combobox`
- any new raw `<table>` outside the infrastructure files
- any new raw `text-[Npx]` off the locked scale

Ratchet pattern — fails only when a count goes **up**. That stops the bleeding the same day. Migrating first is exactly how 2,213 hard-coded sizes and 277 trapping pickers accumulated.

**Then migrate in waves, one PR per wave, operator screens first:** dispatch board → trip pairing → planner → Book Load → work orders → fleet → money screens → reports → home and program.

**Delete the retired components only when their import count reaches zero.** A component with one importer left is not retired.

## 4.4 · Rider — column prefs off `localStorage`
`components/table/useTablePref.ts` stores column order and widths in the browser. The owner loses his layout every time he changes machine. Move to a per-user table keyed `(user_id, storage_key)` holding hidden columns, widths, order, density, page size. Database first, `localStorage` as fallback.

---

# PART 5 — SEAT ASSIGNMENT

| Seat | Job |
|---|---|
| **CC-1** | PART 3 purge. One PR per schema, children before parents. Reseed `lib.trace_counters` after clearing reservations. Report on the three ambiguous account tables. Kill the 2 sample drivers |
| **CC-2** | PART 4.3 **the guard, today**. Then pickers 277 → 0 |
| **CC-3** | PART 4.1 tables — convert the 43, retire the three components |
| **CC-1** | PART 4.4 per-user column prefs |
| **CASCADE** | Re-run the done-gate query after each purge PR and publish the delta. **Live query only — no grep** |
| **CODEX** | Guard that a retired component cannot be reintroduced |
| **CURSOR** | Lead, deploy in batches of 5–10 |

---

# WHY THIS IS THE RIGHT ORDER

Every number the software has shown so far — margins, agings, reconciliation, cash position — was computed over ~900 fixture rows. **Purging to zero is not cleanup. It is the first moment any figure in this system means anything.**

And consolidating first means the wizard, the boards, the planners, the money screens and the reports all get fixed by one change instead of forty. That is what the owner asked for, and it is also the only version of this work that finishes.
