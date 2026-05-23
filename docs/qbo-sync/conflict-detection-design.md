# QBO Sync Conflict Detection Design (Accounting-Block-38)

## Scope

Detection-only release for QBO sync disagreements. This block does **not** implement resolution workflows.

- Backend endpoint: `GET /api/v1/qbo/sync-conflicts`
- Frontend surface: QBO Sync Dashboard `Conflicts` tab
- Entity filter: `customer | vendor | product | account`
- Conflict types:
  - `field_drift`: same QBO ID, selected mirror fields differ from last observed QBO snapshot
  - `missing_in_qbo`: mirror row is linked (`qbo_id` present), but no usable last observed QBO snapshot exists
  - `missing_in_mirror`: a QBO snapshot exists, but mirror row is missing a QBO link (`qbo_id` absent)

## Query Plan

1. **Tenant Scope**
   - Require `operating_company_id` in request query.
   - Run all reads inside company scope and enforce `m.operating_company_id = $1::uuid`.

2. **Entity-specific mirror scan**
   - Source tables:
     - `mdata.qbo_customers`
     - `mdata.qbo_vendors`
     - `mdata.qbo_items`
     - `mdata.qbo_accounts`
   - For each table, construct:
     - `mirror_snapshot` from canonical mirror columns.
     - `qbo_snapshot` from `raw_payload` (last observed QBO shape equivalent to sync payload history).

3. **Conflict classification**
   - Normalize both snapshots to string/null values.
   - Apply the three conflict rules above.
   - For `field_drift`, emit diff entries `{ field, mirror, qbo }`.

4. **Pagination**
   - Cursor-based keyset only; no `OFFSET`.
   - Sort by `(COALESCE(last_seen_at, mirrored_at, updated_at, created_at), id) DESC`.
   - Cursor encodes `{ detected_at, mirror_id, conflict_type }` as base64url JSON.
   - `limit` capped at 50.

## API Response Contract

`{ items, next_cursor }`, where each item contains:

- `entity_type`
- `qbo_id`
- `mirror_id`
- `conflict_type`
- `summary`
- `detected_at`
- `mirror_snapshot`
- `qbo_snapshot`
- `diff[]`

## CI Guard

`scripts/verify-qbo-conflict-detection-tenant-scope.mjs` enforces:

- route exists at `/api/v1/qbo/sync-conflicts`
- tenant scope predicate present
- limit cap enforced (`max(50)`)
- cursor handling present
- no `OFFSET`
