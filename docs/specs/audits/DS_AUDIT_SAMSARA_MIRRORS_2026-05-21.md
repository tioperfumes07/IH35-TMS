# DS-IMPL-2 Audit — Samsara Mirror Integrity (2026-05-21)

Block: `DS-IMPL-2`  
Priority: `P1`  
Type: Read-only audit / discovery  
Date executed: `2026-05-21`  
Auditor: Cursor

## 1) Executive summary

- Samsara-related persistence exists in 4 `integrations` tables: `samsara_config`, `samsara_drivers`, `samsara_vehicles`, `samsara_webhook_events`.
- Active mirror tables (`samsara_drivers`, `samsara_vehicles`) are present but empty for both TRK and TRANSP.
- MUST-DS-5 baseline is partial: external IDs and recency timestamps exist, but source/direction/version sync metadata is missing on core mirrors.
- MUST-DS-1 request-path scan found 1 active synchronous external read path in a registered route (`POST /api/v1/integrations/samsara/config` health check callout).
- Webhook surface exists (1 endpoint) with signature verification and durable event persistence; currently no local webhook traffic observed in mirror table.
- Poller surface is partial: health cron is active; master sync cron exists in code but is not initialized at app startup.
- CAP-13 locked tables (`catalogs.dot_inspection_stations`, `safety.dot_inspection_visits`) are not materialized yet.
- CAP-15 identity boundary is hub-and-spoke: TMS driver is the canonical pivot between Samsara and QBO identities; no direct QBO-vendor-to-Samsara linkage surface exists.

## 2) Mirror table inventory

### 2.1 Samsara-related table discovery

| Schema | Table | Type | Notes |
|---|---|---|---|
| `integrations` | `samsara_config` | Config | Integration enablement/credentials and health state |
| `integrations` | `samsara_drivers` | Mirror | Samsara driver identity to local driver link surface |
| `integrations` | `samsara_vehicles` | Mirror | Samsara vehicle identity to local unit link surface |
| `integrations` | `samsara_webhook_events` | Ingest ledger | Raw webhook ingress with signature validity |
| `safety` | `dot_inspections` | Existing safety table | Not the CAP-13 locked schema pair |

Expected-but-missing tables from Module B/C contract:
- `integrations.samsara_geofences`
- `integrations.samsara_geofence_events`
- `integrations.samsara_positions`
- `integrations.samsara_hos_events`
- `integrations.samsara_dtc_events`
- `catalogs.dot_inspection_stations`
- `safety.dot_inspection_visits`

### 2.2 Row counts (local only; no live Samsara API count pull in this block)

| Table | TRANSP | TRK |
|---|---:|---:|
| `integrations.samsara_config` | 0 | 0 |
| `integrations.samsara_drivers` | 0 | 0 |
| `integrations.samsara_vehicles` | 0 | 0 |
| `integrations.samsara_webhook_events` | 0 | 0 |

### 2.3 Key column inventory (core tables)

- `integrations.samsara_drivers`: `samsara_driver_id`, `local_driver_id`, `raw_payload`, `last_seen_at`
- `integrations.samsara_vehicles`: `samsara_vehicle_id`, `local_unit_id`, `raw_payload`, `last_seen_at`
- `integrations.samsara_webhook_events`: `event_type`, `samsara_event_id`, `signature_valid`, `payload`, `received_at`, `processed_at`, `processing_error`
- `integrations.samsara_config`: `samsara_org_id`, encrypted credentials, `last_health_check_at`, `last_health_status`, `last_error`

## 3) MUST-DS-5 violations

Assessment target mirrors: `integrations.samsara_drivers`, `integrations.samsara_vehicles`, `integrations.samsara_webhook_events`.

- `samsara_drivers`: has external identity (`samsara_driver_id`) and recency (`last_seen_at`), but lacks explicit sync source/direction/version metadata columns.
- `samsara_vehicles`: has external identity (`samsara_vehicle_id`) and recency (`last_seen_at`), but lacks explicit sync source/direction/version metadata columns.
- `samsara_webhook_events`: preserves event identity/timestamps and signature status; suitable as ingest ledger but does not by itself provide canonical mirror projection metadata contract for operational read models.

## 4) MUST-DS-1 violations

### Confirmed violation candidate (active registered route path)

- `POST /api/v1/integrations/samsara/config` in `apps/backend/src/integrations/samsara/samsara-config.routes.ts`
  - Call chain: `registerSamsaraConfigRoutes` -> `runSamsaraHealthCheckForRow` -> `SamsaraClient.testConnection` -> `fetch("https://api.samsara.com/fleet/vehicles?limit=1")`
  - Classification: **Violation candidate** (request path performs synchronous third-party call)
  - Why: route-time external dependency violates local-read boundary intent in MUST-DS-1

### Non-violating / non-active call surfaces

- `samsara-health-cron` path (`cron/samsara-health-cron.ts`) is background and therefore DS-1-safe by architecture boundary.
- `samsara-master-sync` routes (`samsara-master-sync.routes.ts`) would be route-time external calls if activated, but they are not registered in `index.ts` in current runtime.
- `samsara-master-sync.cron.ts` is background-safe pattern but not initialized in `index.ts` (currently dormant code path).

## 5) Webhook + poller infrastructure inventory

### 5.1 Webhook endpoint inventory

- Endpoint: `POST /api/v1/integrations/samsara/webhook`
- File: `apps/backend/src/integrations/samsara/samsara-webhook.routes.ts`
- Input pattern: raw JSON body + query `operating_company_id`
- Payload handling:
  - Parses body to JSON
  - Extracts `event_type` / `samsara_event_id` heuristically
  - Persists every received payload to `integrations.samsara_webhook_events`
- Signature verification:
  - Implemented in `apps/backend/src/integrations/samsara/samsara-webhook-verify.ts`
  - HMAC-SHA256 with header checks (`x-samsara-signature`, etc.)
  - Invalid signature stored with `signature_valid=false` and returns 401

Traffic/activation note:
- Local webhook mirror row count is 0 for TRK/TRANSP in this audit. Route appears deployed (registered), but no traffic evidence in local table during audit window.

### 5.2 Poller / scheduled infrastructure inventory

- Active:
  - `samsara.health_check_cron` via `initializeSamsaraHealthCheckCron` in `index.ts`
  - `_system.background_jobs` shows this job present with run history
- Defined but not initialized:
  - `initializeSamsaraMasterSyncCron` exists in `cron/samsara-master-sync.cron.ts`
  - No startup wiring found in `index.ts`
- Sync worker/ingest projection gap:
  - No registered worker found that consumes `integrations.samsara_webhook_events` into `samsara_drivers` / `samsara_vehicles` projections

## 6) CAP-13 schema status

Locked CAP-13 tables were checked directly:
- `catalogs.dot_inspection_stations`: **absent**
- `safety.dot_inspection_visits`: **absent**

Result:
- CAP-13 locked schema is **not yet materialized** in current DB.
- Because both tables are absent, column-level and CHECK-constraint expression drift validation cannot yet be performed.
- Existing `safety.dot_inspections` table is present but is not a substitute for the locked CAP-13 pair.

## 7) CAP-15 identity mapping status

### 7.1 Boundary surface classification

- **TMS driver <-> Samsara driver:** `Present and bidirectionally mapped`
  - `mdata.drivers.samsara_driver_id`
  - `integrations.samsara_drivers.samsara_driver_id`
  - `integrations.samsara_drivers.local_driver_id` -> `mdata.drivers.id`

- **TMS driver <-> QBO vendor:** `Present but one-directional`
  - `mdata.drivers.qbo_vendor_id` exists
  - `mdata.qbo_vendors` has no direct `driver_id`/`master` back-reference column

- **QBO vendor <-> Samsara driver:** `Absent direct; mediated via TMS driver pivot`
  - No direct `mdata.qbo_vendors` column linking to `samsara_driver_id`
  - Reconciliation pattern is hub-and-spoke through canonical `mdata.drivers`, not full mesh

### 7.2 Schema observation

- `master_data.drivers` schema/table is absent in this DB; canonical driver table is `mdata.drivers`.

## 8) Tooling gaps

- No canonical Samsara remote-count helper exists for authoritative API-vs-mirror drift counting.
- No local persisted remote-count baseline table (Samsara equivalent to QBO count-tracking path) is currently in use.
- No active master-sync scheduler wiring was found (`samsara-master-sync.cron.ts` exists but is not startup-initialized).
- No active webhook-to-mirror projection worker was found; webhook ingress table exists but downstream materialization path is not evident in current runtime wiring.

## 9) Recommended sequence

- **DS-AUDIT-S-001**: Add explicit sync metadata columns to `integrations.samsara_drivers` and `integrations.samsara_vehicles` (source/direction/version fields) to satisfy MUST-DS-5 parity with reconciliation/replay needs. **Severity:** Critical. **Effort:** 4-6 hr.
- **DS-AUDIT-S-002**: Refactor `POST /api/v1/integrations/samsara/config` health probe to queued/background execution with accepted response + persisted status polling to remove request-path third-party dependency (MUST-DS-1). **Severity:** Critical. **Effort:** 4-6 hr.
- **DS-AUDIT-S-003**: Wire and validate `samsara-master-sync` scheduler initialization in startup flow (or explicitly deprecate) so mirror hydration path is deterministic. **Severity:** Important. **Effort:** 2-4 hr.
- **DS-AUDIT-S-004**: Implement webhook-event projection worker from `integrations.samsara_webhook_events` into Samsara mirrors/read models with idempotency and replay semantics. **Severity:** Critical. **Effort:** 1 day.
- **DS-AUDIT-S-005**: Materialize CAP-13 locked schema (`catalogs.dot_inspection_stations`, `safety.dot_inspection_visits`) and validate exact allowed enum value-set semantics in migration tests. **Severity:** Important. **Effort:** 1 day.
- **DS-AUDIT-S-006**: Preserve CAP-15 hub-and-spoke identity by formalizing driver-pivot reconciliation checks (TMS driver as anchor across Samsara and QBO identities) and surfacing unresolved mismatches. **Severity:** Important. **Effort:** 4-6 hr.
- **DS-AUDIT-S-007**: Add Samsara count/reconciliation tooling (local-only baseline + deferred remote comparison helper) under DS-IMPL-3 scope; keep audit blocks read-only. **Severity:** Cleanup. **Effort:** 2-4 hr.
