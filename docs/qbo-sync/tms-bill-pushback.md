# TMS Bill Pushback (Cut 6)

## Context

Task `T11.20.6.2 (cut 6: bills)` closes the QBO write-back umbrella with vendor-side bills.
Pattern mirrors prior cuts:
- source write in TMS table
- outbox enqueue
- tenant-scoped handler
- QBO push via shared push service
- local mirror upsert/update

## Source + Mirror

- **Source table:** `accounting.bills`
  - line child: `accounting.bill_lines`
  - canonical local fields: `vendor_uuid`/`vendor_id`, `bill_number`, `bill_date`, `due_date`, `amount_cents`, `memo`, `coa_account_id`, `qbo_bill_id`, `qbo_sync_token`
- **Mirror table:** `mdata.qbo_bills` (tenant-scoped by `operating_company_id`)
- **QBO delivery path:** `deliverQboBillPush(...)` in `apps/backend/src/qbo/push.service.ts`

## Mapping Rules

1. **Tenant context**
   - enqueue payload always includes `operating_company_id`
   - handler sets `app.operating_company_id` and scopes bill/vendor/account lookups by tenant
2. **Vendor dependency**
   - bill vendor key resolves from `COALESCE(vendor_uuid, vendor_id)`
   - `mdata.vendors.qbo_vendor_id` must exist or handler fails fast (`bill_vendor_qbo_id_missing`)
   - requires cut 2 (vendor write-back) to have established the vendor link
3. **Account dependency**
   - each bill line resolves an account QBO id from `catalogs.accounts.qbo_account_id`
   - if no persisted lines exist, a synthetic line is created from bill header amount + memo and still requires account resolution
   - missing account QBO id fails fast (`bill_line_account_qbo_id_missing`)
   - requires cut 4 (accounts write-back) to have established account links
4. **QBO line payload**
   - line shape maps to QBO `AccountBasedExpenseLineDetail`
   - per line: `Amount`, `Description`, and `AccountRef`
5. **Bill header payload**
   - `VendorRef` <- resolved vendor QBO id
   - `TxnDate` <- `bill_date`
   - `DueDate` <- `due_date`
   - `DocNumber` <- `bill_number`
   - `PrivateNote` <- `memo`

## Outbox Contract

- **event_type:** `tms.bill.push_requested`
- **payload:**
  - `operating_company_id`
  - `bill_id`
  - `operation` (`create` or `update`)

## Safety Invariants

- tenant-scoped fetches for source bill, vendor, and account lookup
- handler refuses invalid UUID payloads and malformed operations
- missing vendor/account upstream sync dependencies fail fast with explicit error codes
