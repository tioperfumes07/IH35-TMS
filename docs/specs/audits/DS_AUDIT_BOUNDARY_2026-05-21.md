# DS-IMPL-4 Audit — Local Read Layer / Sync Layer Boundary (2026-05-21)

Block: `DS-IMPL-4`  
Priority: `P1`  
Type: Read-only audit / discovery  
Date executed: `2026-05-21`  
Auditor: Cursor

## 1) Executive summary

- Active third-party integration surfaces were confirmed for QBO, Samsara, Plaid, FMCSA, Twilio/WhatsApp, Postmark/SES, Cloudflare R2, and Sentry.
- Local-read architecture is strong in core operational endpoints (dispatch, reports, banking review/categorization, QBO autocomplete, units), which read from IH35-managed persisted tables/views.
- MUST-DS-1 boundary violations already identified in DS-IMPL-1/2 remain present and active in request paths (QBO admin replay/deep-health/forensic preflight and Samsara config health probe).
- Additional route-time third-party calls exist in Plaid and FMCSA endpoints; these are primarily integration lifecycle/sync actions rather than day-to-day operational read APIs, but they are important boundary touchpoints to formalize.
- Webhook/worker patterns are present and healthy across QBO/Samsara/Plaid, with durable ingest and background schedulers; QBO shows the most mature queue/outbox shape.
- Samsara master sync remains defined but dormant (route/cron not wired in startup), consistent with DS-IMPL-2.

## 2) Scope and method

This audit executed a system-wide boundary scan for:
- A. Third-party integration inventory (code + schema surfaces).
- B. Local Read Layer vs Sync/Ingest Layer classification by call site.
- C. MUST-DS-1 violation list for synchronous third-party reads in request paths.
- D. Architecture pattern survey (webhooks, queues, workers, cron jobs, outbox dispatchers).
- E. Operational read-path sampling to confirm local-store runtime reads.

### 2.1 SQL inventory used

- `information_schema.tables` scans for `integrations`, `banking`, `catalogs`, `accounting`, `outbox` integration tables.
- `information_schema.columns` checks for `_system.background_jobs` contract and targeted metadata checks.
- `_system.background_jobs` status query for integration-related schedulers.
- Local row-count checks for selected integration/mirror tables (`integrations.*`, `banking.*`, `catalogs.fmcsa_lookups`, `accounting.outbox_events`, `outbox.outbox_queue`).

### 2.2 Code-path scan used

Read-only scan in `apps/backend/src` for:
- External client/call markers (`fetch(`, provider/client modules, env vars, integration keywords).
- Request-path route call chains to QBO/Samsara/Plaid/FMCSA/Twilio/WhatsApp.
- Startup wiring in `index.ts` for route registration and cron/worker initialization.
- Webhook signature verification and persistence behavior.

Noise-reduction filter applied after first-pass scan:
- Excluded `apps/backend/src/__tests__/`, `apps/backend/src/db/`, and `apps/backend/src/utils/` from external-call-site triage unless a runtime route imported the file.

## 3) Integration inventory and boundary classification

### 3.1 Tier 1 integrations (full DS-IMPL-4 treatment)

- **QBO (Intuit):** OAuth, webhook ingest, CDC poller, sync queue worker, outbox dispatcher, admin replay/forensic surfaces.
- **Samsara:** config + health + webhook route, health cron, mirror tables; master sync code exists but not wired.
- **Plaid:** link/exchange/account lifecycle routes, webhook receiver, manual sync/admin sync surfaces, persisted bank account/transaction mirrors.
- **Relay:** no integration call surfaces discovered in backend runtime code.
- **FMCSA/SAFER:** active; routes are registered via `catalogs/index.ts` and mounted through `registerCatalogsRoutes(app)` in `index.ts`.

Not found in current backend runtime:
- OpenAI/Anthropic runtime integration call surfaces.

### 3.2 Tier 1 mirror/read-store inventory

- **QBO:** `mdata.qbo_*`, `integrations.qbo_*`, `qbo_archive.*`, `qbo.*`, `accounting.qbo_remote_counts` (table present, currently empty).
- **Samsara:** `integrations.samsara_config`, `integrations.samsara_drivers`, `integrations.samsara_vehicles`, `integrations.samsara_webhook_events`.
- **Plaid:** `banking.bank_accounts`, `banking.bank_transactions` (active local mirrors for operational reads).
- **FMCSA:** `catalogs.fmcsa_lookups` cache/ledger for lookup reuse.
- **Outbox/queue:** `accounting.outbox_events`, `outbox.outbox_queue`.

### 3.3 Tier 1 current local table counts (selected)

- `integrations.qbo_connections`: TRANSP `1`, TRK `2`
- `integrations.qbo_inbound_events`: `0`
- `integrations.qbo_sync_queue`: `0`
- `integrations.qbo_sync_conflicts`: `0`
- `integrations.samsara_config`: `0`
- `integrations.samsara_drivers`: `0`
- `integrations.samsara_vehicles`: `0`
- `integrations.samsara_webhook_events`: `0`
- `banking.bank_accounts`: TRANSP `5`, TRK `4`
- `banking.bank_transactions`: TRANSP `2567`
- `catalogs.fmcsa_lookups`: `0`
- `accounting.outbox_events`: `0`
- `outbox.outbox_queue`: `0`

### 3.4 Tier 2 integrations (lightweight inventory only)

- **Twilio/WhatsApp/SMS gateways:** `apps/backend/src/auth/twilio-verify.ts`, `apps/backend/src/sms/sender.ts`, `apps/backend/src/whatsapp/sender.ts`, `apps/backend/src/outbox/handlers/twilio-*.ts` — outbound verification/notification dispatch.
- **Postmark/SES email:** `apps/backend/src/email/providers/postmark.ts`, `apps/backend/src/email/providers/ses.ts` — outbound email delivery providers.
- **Cloudflare R2:** `apps/backend/src/storage/r2-client.ts` — file/object storage access and presigned URL generation.
- **Sentry:** `apps/backend/src/lib/sentry.ts` — observability/error telemetry only.
- **OpenAI/Anthropic:** not present in runtime backend integration paths during this audit.

Reclassification check:
- No Tier 2 integration was found reading external application-domain state for UI/runtime operational reads; no Tier 2 -> Tier 1 promotion triggered.

## 4) MUST-DS-1 boundary findings (request-path external reads)

### 4.1 Confirmed active violation set (operational risk)

- `POST /api/v1/admin/sync/inbound/replay-since` -> `runQboCdcIngest(...)` (request-time QBO CDC read).
- `GET /api/v1/admin/health/deep` -> `probeQboCompanyInfo()` (request-time QBO company info read).
- `POST /api/v1/admin/qbo-forensic/start-import` -> `qboQuery(..., "SELECT * FROM CompanyInfo")` preflight in request path.
- `POST /api/v1/integrations/samsara/config` -> `runSamsaraHealthCheckForRow` -> `SamsaraClient.testConnection` (request-time Samsara call).

### 4.2 Additional boundary-touching request paths (integration lifecycle/control-plane)

- Plaid link/exchange/disconnect/manual sync routes perform request-time Plaid calls.
- FMCSA lookup routes perform request-time FMCSA/SAFER calls, with cache-first behavior then persisted results.
- Twilio verification endpoints are request-time third-party calls by design.

These are mostly integration control-plane actions, not the primary operational read endpoints used for dispatch/accounting runtime views. They still require explicit boundary policy treatment (allowlist + controls) to avoid ambiguity.

## 5) Architecture pattern survey (Sync/Ingest Layer)

### 5.1 Webhook pattern

- **QBO webhook:** signature verified (`intuit-signature` HMAC), persists entities into `integrations.qbo_inbound_events`.
- **Samsara webhook:** signature verified (`samsara-webhook-verify`), persists raw events to `integrations.samsara_webhook_events` with signature status.
- **Plaid webhook:** JWT signature verification (`plaid-verification`) and async processing; persists audit trail and triggers sync handlers.

### 5.2 Queue/worker/outbox pattern

- QBO has active queue/worker shape (`qbo.sync_runs`, sync worker loop, outbox dispatcher from `accounting.outbox_events`).
- Generic outbox processor exists (`outbox` module) with pluggable handlers (`twilio-sms`, `twilio-whatsapp`, qbo push handler).
- Background job run tracking is standardized via `_system.background_jobs` and `wrapBackgroundJobTick`.

### 5.3 Scheduler pattern

From `_system.background_jobs`:
- Active and successful: `integrations.qbo_cdc_poll`, `integrations.qbo_inbound_sync`, `qbo.master_data_sync.*`, `qbo.token_refresh_cron`, `qbo.sync_queue_runner`, `email.queue_processor`.
- Active with intermittent failures: `qbo.sync_alerts_cron` and `samsara.health_check_cron` (both showing `invalid input syntax for type uuid: ""` in `last_error_message`).
- Dormant-by-wiring gap: `samsara-master-sync` cron/route modules exist in code but are not initialized/registered in `index.ts`.

## 6) Operational read-path sampling (Local Read Layer)

Sampled high-impact user-facing runtime APIs that resolve from local persisted stores:
- `GET /api/v1/dispatch/loads` -> `views.dispatch_load_with_driver_status`, `mdata.*`, `views.*` joins.
- `GET /api/v1/mdata/qbo/vendors` (and related autocomplete routes) -> `mdata.qbo_*`.
- `GET /api/v1/customers/:id/billing-summary` / customer detail family -> local `mdata` projections.
- `GET /api/v1/banking/transactions/uncategorized` -> `banking.bank_transactions` + local joins.
- `GET /api/v1/reports/cash-flow-overview` -> `banking.bank_accounts`, `banking.bank_transactions`, `views.factoring_summary`.
- `GET /api/v1/reports/fuel-reconciliation` -> `banking.bank_transactions`, `mdata.loads`, `mdata.units`, maintenance/work-order tables.
- `GET /api/v1/mdata/units` -> local `mdata.units` scope.

Conclusion: operational read layer is predominantly local-first; boundary pressure is concentrated in admin/control-plane integration routes.

## 7) Numbered findings

- **DS-AUDIT-B-001:** Tier-1 integration scope (QBO/Samsara/Plaid/Relay/FMCSA) is fully covered; Relay has no active backend runtime surface, and FMCSA is active/registered through catalogs routing.
- **DS-AUDIT-B-002:** Local Read Layer contract is largely upheld in high-frequency operational APIs (dispatch, reports, banking review, mdata, QBO autocomplete).
- **DS-AUDIT-B-003:** MUST-DS-1 violation set from DS-IMPL-1/2 remains active: 4 request-time third-party read paths (3 QBO, 1 Samsara) are still synchronous.
- **DS-AUDIT-B-004:** Plaid/FMCSA routes include request-time external calls in Tier-1 control-plane endpoints; these are not core operational read endpoints but need explicit policy classification to prevent drift.
- **DS-AUDIT-B-005:** Sync/Ingest architecture is mature on QBO (webhook + queue + worker + outbox) and present on Plaid/Samsara webhooks, but Samsara master-sync remains dormant due missing startup wiring.
- **DS-AUDIT-B-006:** Background scheduler telemetry shows recurring UUID-context failure signatures in `qbo.sync_alerts_cron` and `samsara.health_check_cron`, indicating shared context hygiene risk in job execution.
- **DS-AUDIT-B-007:** Tier-2 integrations (Twilio/WhatsApp, Postmark/SES, R2, Sentry) are currently dispatch/infrastructure-only and do not drive operational external read-state in sampled runtime paths.
- **DS-AUDIT-B-008:** Several integration staging tables are currently empty (`integrations.qbo_inbound_events`, `integrations.qbo_sync_queue`, `integrations.qbo_sync_conflicts`, Samsara mirrors/events), which limits replay/reconciliation validation confidence until ingestion volume increases.

## 8) Master remediation sequence (DS-IMPL-1 + DS-IMPL-2 + DS-IMPL-4)

- **DS-AUDIT-B-009:** Refactor active MUST-DS-1 request-path reads (QBO replay, QBO deep health, QBO forensic preflight, Samsara config health) to accepted+queued/background execution with persisted status polling. **Severity:** Critical. **Effort:** 1-2 days.
- **DS-AUDIT-B-010:** Build canonical remote-count collector and populate `accounting.qbo_remote_counts` for deterministic drift visibility (carry-forward from DS-IMPL-1 F-TOOLING-001). **Severity:** Critical. **Effort:** 4-6 hr.
- **DS-AUDIT-B-011:** Define canonical DS-5 mirror metadata contract and align QBO + Samsara mirror schemas incrementally (identity/source/direction/version/timestamps). **Severity:** Important. **Effort:** 1-2 days.
- **DS-AUDIT-B-012:** Implement Samsara webhook-event projection worker into read models with idempotent replay semantics (carry-forward from DS-IMPL-2 S-004). **Severity:** Critical. **Effort:** 1 day.
- **DS-AUDIT-B-013:** Activate or formally retire dormant `samsara-master-sync` route/cron surfaces so runtime behavior matches architectural intent (carry-forward from DS-IMPL-2 S-003 and DS-IMPL-4 B-005). **Severity:** Important. **Effort:** 2-4 hr.
- **DS-AUDIT-B-014:** Materialize CAP-13 locked schema (`catalogs.dot_inspection_stations`, `safety.dot_inspection_visits`) with exact enum-value contract tests (carry-forward from DS-IMPL-2 S-005). **Severity:** Important. **Effort:** 1 day.
- **DS-AUDIT-B-015:** Formalize CAP-15 reconciliation checks using TMS-driver hub-and-spoke identity validation across Samsara and QBO surfaces (carry-forward from DS-IMPL-2 S-006). **Severity:** Important. **Effort:** 4-6 hr.
- **DS-AUDIT-B-016:** Add boundary policy annotations for Tier-1 control-plane routes (Plaid/FMCSA) to explicitly allow interactive external calls while preserving Local Read Layer guarantees for operational routes. **Severity:** Important. **Effort:** 4-6 hr.
- **DS-AUDIT-B-017:** Harden scheduler context initialization to eliminate empty-UUID failures in `qbo.sync_alerts_cron` and `samsara.health_check_cron`. **Severity:** Important. **Effort:** 2-4 hr.
- **DS-AUDIT-B-018:** Expand reconciliation observability across mirrors/webhook ledgers/queues/outbox with local-only dashboards and alerts (no live API pull in audit block). **Severity:** Cleanup. **Effort:** 4-6 hr.
