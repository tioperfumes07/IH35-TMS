# TMS Account Pushback (Cut 4)

## Context

Task `T11.20.6.2 (cut 4: accounts)` extends QBO write-back to TMS chart-of-accounts writes.
Pattern mirrors customer/vendor/item pushback:
- source write in TMS table
- outbox enqueue
- tenant-scoped handler
- QBO push via shared push service
- local mirror upsert/update

## Source + Mirror

- **Source table:** `catalogs.accounts`
  - canonical local fields: `account_number`, `account_name`, `account_type`, `account_subtype`, `qbo_account_id`, `deactivated_at`
- **Mirror table:** `mdata.qbo_accounts` (tenant-scoped by `operating_company_id`)
- **QBO delivery path:** `deliverQboMasterEntityPush(... entity: "account" ...)` in `apps/backend/src/qbo/push.service.ts`

## Mapping Rules

1. **Tenant context**
   - enqueue payload always includes `operating_company_id`
   - handler sets `app.operating_company_id` and scopes source/mirror lookups by tenant
2. **Account identity**
   - source account key: `catalogs.accounts.id`
   - mirror preference:
     - first by linked `qbo_account_id` in tenant mirror
     - fallback by normalized account name in same tenant
3. **Field translation**
   - `account_name` -> `mdata.qbo_accounts.name`
   - `account_name` -> `mdata.qbo_accounts.full_qualified_name` (current cut baseline)
   - `account_type` -> `mdata.qbo_accounts.account_type` and QBO `AccountType`
   - `account_subtype` -> `mdata.qbo_accounts.account_sub_type` and QBO `AccountSubType`
   - `deactivated_at IS NULL` -> `mdata.qbo_accounts.active`
   - payload metadata keeps:
     - `acct_num` from `account_number` -> QBO `AcctNum`
     - `classification` derived from `account_type` -> QBO `Classification`
4. **QBO operation**
   - handler calls `deliverQboMasterEntityPush` with `entity: "account"`
   - operation resolves to `create` vs `update` based on mirror link state
5. **Back-link**
   - after successful push, handler syncs `catalogs.accounts.qbo_account_id` from mirror `qbo_id`

## Outbox Contract

- **event_type:** `tms.account.push_requested`
- **payload:**
  - `operating_company_id`
  - `account_id`
  - `operation` (`create` or `update`)

## Safety Invariants

- tenant-scoped lookups on `catalogs.accounts` and `mdata.qbo_accounts`
- no cross-tenant mirror joins
- handler refuses invalid UUID payloads and malformed operations
