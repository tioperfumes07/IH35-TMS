# TMS Invoice Pushback (Cut 5)

## Context

Task `T11.20.6.2 (cut 5: invoices)` extends QBO write-back to transactional invoices.
This cut follows the same outbox + tenant-scope pattern as cuts 1-4, but adds line-level payload assembly and dependency fail-fast behavior.

## Source + Mirror

- **Source header table:** `accounting.invoices`
- **Source line table:** `accounting.invoice_lines`
- **Mirror table:** `mdata.qbo_invoices` (tenant-scoped by `operating_company_id`)
- **QBO delivery path:** `deliverQboInvoicePush(...)` in `apps/backend/src/qbo/push.service.ts`

## Dependency Rules (Fail-Fast)

1. **Customer prerequisite**
   - invoice customer must have `mdata.customers.qbo_customer_id`
   - if missing: handler throws `invoice_customer_missing_qbo_id`
2. **Item prerequisite per line**
   - each line must resolve `qbo_item_id` directly or via tenant mirror fallback by line description
   - if unresolved: handler throws `invoice_line_missing_qbo_item_id:*`
3. **Ordering caveat**
   - customers and items should be synced before invoices
   - invoice push fails fast with explicit errors when prerequisites are missing

## Header Mapping

- `display_id` -> QBO `DocNumber`
- `issue_date` -> QBO `TxnDate`
- `due_date` -> QBO `DueDate`
- customer `qbo_customer_id` -> QBO `CustomerRef.value`
- `ar_email_snapshot` -> QBO `BillEmail.Address`
- `internal_notes` -> QBO `PrivateNote`
- `customer_notes` -> QBO `CustomerMemo.value`

## Line Mapping

Each invoice line becomes a QBO `SalesItemLineDetail` line:
- `line_total_cents` -> `Amount`
- `qbo_item_id` -> `SalesItemLineDetail.ItemRef.value`
- `quantity` -> `SalesItemLineDetail.Qty`
- `unit_amount_cents` -> `SalesItemLineDetail.UnitPrice`
- `qbo_class_snapshot` -> `SalesItemLineDetail.ClassRef.value` (when present)
- per-line tax mapping -> `SalesItemLineDetail.TaxCodeRef.value`

### Tax Mapping

- Freight lines (`linehaul`, `fsc`) => `NON` (no-tax / inter-state baseline)
- Other lines:
  - customer billing state `CA` => `TAX_CA`
  - customer billing state `TX` => `TAX_TX`
  - fallback => `NON`

## Outbox Contract

- **event_type:** `tms.invoice.push_requested`
- **payload:**
  - `operating_company_id`
  - `invoice_id`
  - `operation` (`create` or `update`)

## Safety Invariants

- tenant-scoped fetches on `accounting.invoices`, `accounting.invoice_lines`, and `mdata.qbo_invoices`
- no cross-tenant invoice/line/mirror joins
- mirror upsert tracks `sync_status`, `last_synced_at`, and QBO ids/tokens
- successful push emits `audit.append_event` with `event_class='qbo_invoice_pushed'`
