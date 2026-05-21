# DS-IMPL-1 Audit — QBO Mirror Integrity (2026-05-21)

Block: `DS-IMPL-1`  
Priority: `P1`  
Type: Read-only audit / discovery  
Date executed: `2026-05-21`  
Auditor: Cursor

## 1) Scope and method

This audit executed read-only inventory for:
- A. Existing QBO mirror-related tables in Neon.
- B. MUST-DS-5 compliance signals (external identity + sync metadata persistence).
- C. MUST-DS-1 violations (synchronous QBO reads in user-request paths).
- D. Local row counts and drift-readiness posture (without live QBO pulls in this block).

### 1.1 SQL inventory used

- `information_schema.tables` for `integrations.*`.
- `information_schema.tables` for all table names matching `%qbo%` / `mirror_%`.
- `information_schema.tables` for schemas `qbo` and `qbo_archive`.
- `information_schema.columns` for QBO-related table metadata.
- `information_schema.table_constraints` for mirror identity constraints.
- `COUNT(*)` inventory for mirror and QBO operational tables.

### 1.2 Code-path scan used

Read-only scan in `apps/backend/src` for:
- `quickbooks.api.intuit.com`, `api.intuit.com`, `intuit`
- `runQboCdcIngest(`, `runAdminDeepHealthProbe(`, `qboCompanyContext(`
- `qbo_remote_counts`, count-helper signatures, and count-sync references

## 2) Inventory results

### 2.1 QBO-related tables discovered

QBO-related tables exist across:
- `mdata`: `qbo_accounts`, `qbo_classes`, `qbo_customers`, `qbo_items`, `qbo_vendors`, `qbo_sync_runs`
- `integrations`: `qbo_connections`, `qbo_inbound_events`, `qbo_sync_conflicts`, `qbo_sync_queue`, `qbo_vendor_linkage_events`
- `qbo`: `sync_runs`, `sync_alerts`, `bill_payment_mappings`
- `qbo_archive`: `entities_snapshot`, `transactions_snapshot`, `attachments_snapshot`, `import_batches`, `import_batch_audit_log`, `forensic_anomalies`
- `accounting`: `qbo_remote_counts` (currently empty)

### 2.2 Mirror tables in active use

Primary active mirrors for master data:
- `mdata.qbo_accounts`
- `mdata.qbo_classes`
- `mdata.qbo_customers`
- `mdata.qbo_items`
- `mdata.qbo_vendors`

Archive mirrors/snapshots in active use:
- `qbo_archive.entities_snapshot`
- `qbo_archive.transactions_snapshot`
- `qbo_archive.attachments_snapshot`

### 2.3 Local row counts (this block)

TRK/TRANSP counts from local mirrors:
- `mdata.qbo_accounts`: TRANSP `365`, TRK `917`
- `mdata.qbo_classes`: TRANSP `172`, TRK `0`
- `mdata.qbo_customers`: TRANSP `1209`, TRK `1446`
- `mdata.qbo_items`: TRANSP `179`, TRK `48`
- `mdata.qbo_vendors`: TRANSP `872`, TRK `1872`

Additional QBO operational/archive counts:
- `mdata.qbo_sync_runs`: `3032`
- `qbo_archive.entities_snapshot`: `59920`
- `qbo_archive.transactions_snapshot`: `687364`
- `qbo_archive.attachments_snapshot`: `0`
- `qbo_archive.forensic_anomalies`: `1012708`
- `qbo_archive.import_batches`: `21`
- `qbo_archive.import_batch_audit_log`: `2502`
- `integrations.qbo_connections`: `3`
- `integrations.qbo_inbound_events`: `0`
- `integrations.qbo_sync_queue`: `0`
- `integrations.qbo_sync_conflicts`: `0`
- `integrations.qbo_vendor_linkage_events`: `0`
- `qbo.sync_runs`: `0`
- `qbo.sync_alerts`: `0`
- `qbo.bill_payment_mappings`: `0`
- `accounting.qbo_remote_counts`: `0`

Remote QBO counts were intentionally **not** pulled in this block.

## 3) MUST-DS checks

## 3.1 MUST-DS-5 (external identity and sync metadata preservation)

Observed positives:
- Core `mdata.qbo_*` mirrors preserve external identity via `qbo_id` and sync token via `qbo_sync_token`.
- `mdata.qbo_*` mirrors preserve freshness via `qbo_updated_at` and local mirror timestamp via `mirrored_at`.
- `mdata.qbo_*` mirrors enforce uniqueness of external identity at company scope (`UNIQUE (operating_company_id, qbo_id)`).
- `qbo_archive.entities_snapshot` and `qbo_archive.transactions_snapshot` preserve external IDs (`qbo_entity_id`, `qbo_txn_id`) plus raw payload snapshots and snapshot timestamps.

Observed gaps:
- No single canonical column contract across all QBO-related tables (mixed names: `qbo_id`, `qbo_entity_id`, `qbo_txn_id`, `synced_at`, `qbo_updated_at`, `snapshot_taken_at`).
- Operational queue/event tables retain useful metadata but are not normalized to one DS-5 schema.

## 3.2 MUST-DS-1 (no synchronous external QBO reads in user-request paths)

Confirmed synchronous QBO reads in request paths:
- `apps/backend/src/admin/accounting-sync.routes.ts` calls `runQboCdcIngest(...)` directly in `/api/v1/admin/sync/inbound/replay-since`; `runQboCdcIngest` performs QBO CDC `GET` calls.
- `apps/backend/src/admin/health-deep.routes.ts` calls `runAdminDeepHealthProbe()`; probe includes `probeQboCompanyInfo()` which performs synchronous QBO `GET /companyinfo`.
- `apps/backend/src/integrations/qbo/forensic-admin.routes.ts` preflight for `/api/v1/admin/qbo-forensic/start-import` calls `qboQuery(context, "SELECT * FROM CompanyInfo")` synchronously before enqueueing background import.

Notes:
- These are mostly Owner/Admin flows, but they are still request-time external reads and therefore DS-1 risk points.
- Background equivalents exist for CDC polling and forensic import execution, but these specific route-time checks still perform live reads.

## 3.3 Drift-readiness and counting capability

- No canonical backend helper was found for authoritative **remote** QBO entity counts.
- `accounting.qbo_remote_counts` table exists but is currently empty, and no active count-population flow was found in backend source.
- Existing count usage in code is local/internal health/queue counting, not canonical QBO-vs-mirror drift counting.

## 4) Numbered findings

- **DS-AUDIT-F-001**: QBO mirror/storage footprint is broad and split across `mdata`, `integrations`, `qbo`, and `qbo_archive`; governance currently depends on convention rather than a single mirrored contract surface.
- **DS-AUDIT-F-002**: Core master-data mirrors (`mdata.qbo_*`) preserve external identity and sync metadata sufficiently for DS-5 baseline (`qbo_id`, `qbo_sync_token`, `qbo_updated_at`, `mirrored_at`) and enforce company-scoped identity uniqueness.
- **DS-AUDIT-F-003**: Archive mirrors (`qbo_archive.entities_snapshot`, `qbo_archive.transactions_snapshot`) preserve immutable external identity and snapshot timestamps, supporting forensic replay and historical traceability.
- **DS-AUDIT-F-004**: DS-5 naming is inconsistent across QBO-related tables (identity/timestamp/metadata column divergence), increasing integration risk and query complexity.
- **DS-AUDIT-F-005**: MUST-DS-1 violation candidate: `/api/v1/admin/sync/inbound/replay-since` performs synchronous external QBO reads during request handling via `runQboCdcIngest`.
- **DS-AUDIT-F-006**: MUST-DS-1 violation candidate: `/api/v1/admin/health/deep` performs synchronous external QBO `companyinfo` read during request handling.
- **DS-AUDIT-F-007**: MUST-DS-1 violation candidate: `/api/v1/admin/qbo-forensic/start-import` performs synchronous external QBO preflight query (`CompanyInfo`) in request path.
- **DS-AUDIT-F-TOOLING-001**: No canonical QBO count helper exists. Drift detection requires either (a) building one or (b) manual QBO UI inspection. Recommended fix: build helper as part of DS-IMPL-3 reconciliation worker scope.

## 5) Immediate risk flags

- Data corruption found: **No** (none observed in this audit scope).
- Exposed secret found: **No** (none observed in this audit scope).
- Immediate remediation required now: **No blocker discovered that required stopping this block**.

## 6) Hand-off to next blocks

Recommended DS-IMPL-3 / DS-IMPL-4 follow-through:
- Build canonical remote-count collector and persist to `accounting.qbo_remote_counts` with deterministic entity/company timestamp keys. **Severity:** Critical. **Effort:** 4-6 hr.
- Refactor route-time QBO reads (F-005, F-006, F-007) into queued/background jobs where feasible, preserving admin UX via accepted/queued responses. **Severity:** Critical. **Effort:** 1 day.
- Define canonical DS-5 mirror metadata contract (identity + sync timestamps + source/version fields) and align QBO-related tables incrementally across `mdata`, `integrations`, `qbo`, and `qbo_archive` (F-004). **Severity:** Important. **Effort:** 1 day.
