# POSTING_ENGINE_MVP_DECISIONS

## SECTION 1 — INVOICE POSTING ELIGIBILITY MAP

Repo evidence reviewed:
- `db/migrations/0060_p3_t11_20_1_accounting_invoices_schema.sql` (`accounting.invoices.status` CHECK constraint).
- `apps/backend/src/accounting/invoices.routes.ts` (status transitions: create as `draft`, send to `sent`, void to `void`; edit restriction to `draft`).
- `apps/backend/src/accounting/invoices.service.ts` (expanded create path also inserts `draft`).
- `apps/frontend/src/api/accounting.ts` (`InvoiceStatus` type union).

Exact invoice status values in repo:
- `draft`
- `sent`
- `partial`
- `paid`
- `void`
- `factored`

Posting eligibility by status:
- `draft` -> POSTING-ELIGIBLE: no
- `sent` -> POSTING-ELIGIBLE: yes
- `partial` -> POSTING-ELIGIBLE: yes
- `paid` -> POSTING-ELIGIBLE: yes
- `void` -> POSTING-ELIGIBLE: no
- `factored` -> POSTING-ELIGIBLE: yes

Single engine rule for MVP:
- post only when `invoice.status IN ('sent', 'partial', 'paid', 'factored')`.
- do not post when `invoice.status IN ('draft', 'void')`.

Rationale from current model:
- Both create paths write `draft`; `send` endpoint is the explicit transition to `sent`.
- `partial` and `paid` are downstream payment-application states from already-issued invoices.
- `factored` is an explicit persisted status in the same invoice state model and remains posting-eligible under the current repo contract.

## SECTION 2 — BILL ACCOUNT MAPPING RULE

Repo evidence reviewed:
- `db/migrations/0090_p5_d2_bill_payment_balance.sql` (`accounting.bills.coa_account_id` exists).
- `db/migrations/0123_p6_pre_ledger_drift_reconciliation.sql` (`accounting.bill_lines.expense_category_uuid` exists; no bill-line `account_id` column added there).
- `apps/backend/src/accounting/bills.routes.ts` (bill create input accepts optional `coa_account_id` at bill header).
- `apps/backend/src/accounting/bills.service.ts` (bill create persists `coa_account_id`; no bill-line posting/account mapping logic implemented here).
- `db/migrations/0152_p6_t11187_lists_hub_accounting_catalog_completion.sql` (`catalogs.expense_categories` exists but no explicit dedicated `account_id` column is defined in schema).

Current storage finding:
- Bill line explicit `account_id`: NOT FOUND IN REPO (for `accounting.bill_lines`).
- Bill line category reference: FOUND (`accounting.bill_lines.expense_category_uuid`).
- Bill header account reference: FOUND (`accounting.bills.coa_account_id`).

Status:
- Bill-line account/category contract for posting: PARTIAL.

Engine mapping rule (MVP decision):
1. If a bill line has explicit `account_id` (future-safe path), use it directly.
2. Else, if a bill line has `expense_category_uuid`, resolve that category through a maintained category->account mapping source.
3. Else, if bill-level `coa_account_id` exists, use that bill header account for the line debit.
4. If none of the above resolve an account, fail with `BILL_LINE_ACCOUNT_UNRESOLVED`.
5. No silent default expense account is allowed.

Where category->account mapping must live:
- NOT FOUND IN REPO as a dedicated, explicit contract today.
- Must be established before engine implementation either by:
  - a dedicated mapping table, or
  - an explicit structured key in `catalogs.expense_categories.metadata` with enforced validation.

Open question flagged (not auto-decided):
- Should bill-header `coa_account_id` be an allowed fallback when line-level category/account is missing, or should MVP require line-level resolution only? Current repo supports header-level `coa_account_id`, but the strictest posting contract may choose to require line-level mapping to prevent mixed-category ambiguity.
