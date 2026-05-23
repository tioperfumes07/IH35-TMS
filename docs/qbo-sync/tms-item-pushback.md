# TMS Item Pushback (Cut 3)

## Context

Task `T11.20.6.2 (cut 3: items)` extends QBO write-back to TMS-managed items.
Pattern mirrors customer/vendor pushback:
- source write in TMS table
- outbox enqueue
- tenant-scoped handler
- QBO push via shared push service
- local mirror upsert/update

## Source + Mirror

- **Source table:** `catalogs.items`
  - canonical local fields: `item_name`, `item_code`, `item_type`, `description`, `unit_price_cents`, `default_income_account_id`, `qbo_item_id`, `deactivated_at`
  - note: `catalogs.*` are global catalog tables (no `operating_company_id` column)
- **Mirror table:** `mdata.qbo_items` (tenant-scoped by `operating_company_id`)

## Mapping Rules

1. **Tenant context**
   - enqueue payload always includes `operating_company_id`
   - handler sets `app.operating_company_id` and scopes mirror/account lookups by tenant
2. **Item identity**
   - source item key: `catalogs.items.id`
   - mirror preference:
     - first by linked `qbo_item_id` in tenant mirror
     - fallback by normalized name in same tenant
3. **Field translation**
   - `item_name` -> `mdata.qbo_items.name`
   - `item_code` -> `mdata.qbo_items.sku`
   - `item_type` -> `mdata.qbo_items.item_type`
   - `unit_price_cents` -> `mdata.qbo_items.unit_price_cents`
   - `deactivated_at IS NULL` -> `mdata.qbo_items.active`
   - payload metadata keeps `description`, `item_id`, and resolved `income_account_qbo_id`
4. **Income account**
   - resolved from `catalogs.accounts.qbo_account_id` using `default_income_account_id` plus tenant filter
   - create path requires a resolvable tenant income account QBO id
5. **QBO operation**
   - handler calls `deliverQboMasterEntityPush` with `entity: "item"`
   - operation resolves to `create` vs `update` based on mirror link state
6. **Back-link**
   - after successful push, handler syncs `catalogs.items.qbo_item_id` from mirror `qbo_id`

## Outbox Contract

- **event_type:** `tms.item.push_requested`
- **payload:**
  - `operating_company_id`
  - `item_id`
  - `operation` (`create` or `update`)

## Safety Invariants

- tenant-scoped lookups on `catalogs.accounts` and `mdata.qbo_items`
- no cross-tenant mirror/account joins
- handler refuses invalid UUID payloads and malformed operations
