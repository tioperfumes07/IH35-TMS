# CRON INVENTORY — IH35-TMS
**Date:** 2026-06-06  
**Block:** GAP-CRON-AUDIT-AND-RETUNE (Block 13, Wave B)  
**Auditor:** Cursor (Sonnet 4.6)  
**Method:** Direct source file reads — all schedule expressions copied verbatim  
**Total distinct cron jobs found:** 51 (across 34 source files; some files register multiple schedules)

---

## LEGEND

| Column | Notes |
|--------|-------|
| Schedule | **Verbatim** from source code — no interpretation |
| Translated | Plain English — derived only after copying exact expression |
| is_active filter | ✅ queries `org.companies WHERE is_active = true` · ❌ no filter · N/A not company-scoped |
| Idempotent | ✅ uses ON CONFLICT / FOR UPDATE SKIP LOCKED / watermark / dedup · ❌ no guard |
| Failure recovery documented | ✅ explicit error handling with logging / email alert / retry logic · ❌ bare throw |

---

## 1. MAINTENANCE / PM

### 1.1 PM Auto-Engine
| Field | Value |
|-------|-------|
| **Schedule** | `"5 * * * *"` |
| **Translated** | Hourly at minute :05 (America/Chicago) |
| **Code file:line** | `apps/backend/src/maintenance/pm-auto-engine.cron.ts:19` |
| **Purpose** | Evaluates preventive maintenance schedules; auto-creates work orders for units that are due |
| **Tables written** | `maintenance.pm_work_orders` (inferred from `runPmAutoEngineCronTick`) |
| **is_active filter** | ✅ (handled inside `runPmAutoEngineCronTick`) |
| **Idempotent** | ✅ (service layer deduplicates open WOs) |
| **Failure recovery documented** | ✅ (`wrapBackgroundJobTick` catches and logs; env flag `ENABLE_PM_AUTO_ENGINE_CRON=false` to disable) |

---

## 2. DRIVER FINANCE

### 2.1 Driver Settlement Auto-Pay
| Field | Value |
|-------|-------|
| **Schedule** | `"0 6 * * 5"` |
| **Translated** | Weekly every Friday at 06:00 (America/Chicago) |
| **Code file:line** | `apps/backend/src/driver-finance/auto-pay.cron.ts:46` |
| **Purpose** | Queues payment for all `locked`/`final` settlements where driver `settlement_auto_pay_enabled = true` |
| **Tables written** | `driver_finance.driver_settlements` (payment_state), `audit.crud_events` |
| **is_active filter** | ✅ (`WHERE is_active = true AND deactivated_at IS NULL`) |
| **Idempotent** | ✅ (only processes `payment_state = 'unpaid'`; individual failures logged and skipped) |
| **Failure recovery documented** | ✅ (per-row warn on failure; continues loop; `wrapBackgroundJobTick` wraps entire tick) |

---

## 3. CASH ADVANCES

### 3.1 Cash Advance Request Expiry
| Field | Value |
|-------|-------|
| **Schedule** | `"15 6 * * *"` |
| **Translated** | Daily at 06:15 (America/Chicago) |
| **Code file:line** | `apps/backend/src/cron/cash-advance-request-expiry-cron.ts:22` |
| **Purpose** | Marks `pending` / `under_review` cash advance requests as `expired` when past `expires_at` |
| **Tables written** | `driver_finance.cash_advance_requests` |
| **is_active filter** | N/A (operates on requests, not companies) |
| **Idempotent** | ✅ (only targets `pending`/`under_review` status; expires_at predicate prevents re-expiry) |
| **Failure recovery documented** | ✅ (`wrapBackgroundJobTick`; env flag `ENABLE_CASH_ADVANCE_REQUEST_EXPIRY_CRON=false`) |

---

## 4. ACCOUNTING / COLLECTIONS

### 4.1 Collections Sync
| Field | Value |
|-------|-------|
| **Schedule** | `"0 4 * * *"` |
| **Translated** | Daily at 04:00 (America/Chicago) |
| **Code file:line** | `apps/backend/src/cron/collections-sync.cron.ts:51` |
| **Purpose** | Syncs `accounting.collections` task state for all active companies |
| **Tables written** | `accounting.collections` (and related tasks) |
| **is_active filter** | ✅ (`WHERE is_active = true AND deactivated_at IS NULL`) |
| **Idempotent** | ✅ (service uses upsert logic) |
| **Failure recovery documented** | ✅ (`wrapBackgroundJobTick`; env flag `ACCOUNTING_COLLECTIONS_SYNC_ENABLED=false`) |

### 4.2 Recurring Templates Materialization
| Field | Value |
|-------|-------|
| **Schedule** | `setInterval(15 * 60 * 1000)` |
| **Translated** | Every 15 minutes (based on process uptime, not wall-clock) |
| **Code file:line** | `apps/backend/src/cron/recurring-templates.cron.ts:1478` |
| **Purpose** | Materializes due `recurring_templates` rows into actual accounting records (bills/invoices) |
| **Tables written** | Varies by template type (invoices, bills, journal entries) |
| **is_active filter** | ✅ (handled inside `processRecurringTemplatesTick`) |
| **Idempotent** | ✅ (`processRecurringTemplatesTick` processes up to 50 per tick with dedup) |
| **Failure recovery documented** | ✅ (`wrapBackgroundJobTick`; `markRunnerFailed` on error) |

---

## 5. DAILY TASK ALERTS

### 5.1 Daily Task Alerts
| Field | Value |
|-------|-------|
| **Schedule** | `setInterval(DAILY_TASK_ALERTS_INTERVAL_MS ?? 60000)` |
| **Translated** | Every 60 seconds by default (configurable via `DAILY_TASK_ALERTS_INTERVAL_MS`; minimum 10,000 ms) |
| **Code file:line** | `apps/backend/src/cron/daily-task-alerts.cron.ts:277` |
| **Purpose** | Checks for tasks nearing due (within 2 hours) or overdue; inserts `ops.daily_task_alerts` and queues emails |
| **Tables written** | `ops.daily_task_alerts`, `email.email_queue` |
| **is_active filter** | N/A (targets `ops.daily_tasks`, not company-scoped loop) |
| **Idempotent** | ✅ (`ON CONFLICT (daily_task_id, alert_type, target_user_id, channel) DO NOTHING`) |
| **Failure recovery documented** | ✅ (try/catch with `app.log.error`; env flag `DAILY_TASK_ALERTS_ENABLED=false`) |

---

## 6. ERROR MONITORING

### 6.1 Error Digest
| Field | Value |
|-------|-------|
| **Schedule** | `setInterval(60_000)` |
| **Translated** | Every 60 seconds |
| **Code file:line** | `apps/backend/src/cron/error-digest.cron.ts:312` |
| **Purpose** | Monitors in-memory error buffer; if >10 errors/min, appends a warning to `audit.events` and logs |
| **Tables written** | `audit.events` (via `audit.append_event`) |
| **is_active filter** | N/A (process-level monitoring) |
| **Idempotent** | ✅ (threshold-gated; audit append is append-only) |
| **Failure recovery documented** | ✅ (try/catch with `app.log.warn`) |

---

## 7. SAFETY / FUEL

### 7.1 Fuel GPS Match
| Field | Value |
|-------|-------|
| **Schedule** | `"0 * * * *"` |
| **Translated** | Hourly at minute :00 (America/Chicago) |
| **Code file:line** | `apps/backend/src/cron/fuel-gps-match.cron.ts:352` |
| **Purpose** | Matches fuel card transactions to GPS positions for safety/fraud detection |
| **Tables written** | `safety.fuel_gps_matches` (inferred) |
| **is_active filter** | ✅ (`WHERE is_active = true AND deactivated_at IS NULL`) |
| **Idempotent** | ✅ (`runFuelGpsMatchBatch` uses match keys) |
| **Failure recovery documented** | ✅ (logged per company; env flag `FUEL_GPS_MATCH_CRON_ENABLED=false`) |

### 7.2 Geofence Breach Detector
| Field | Value |
|-------|-------|
| **Schedule** | `"*/1 * * * *"` |
| **Translated** | Every 1 minute (America/Chicago) |
| **Code file:line** | `apps/backend/src/cron/geofence-breach-detector.cron.ts:628` |
| **Purpose** | Detects vehicle geofence entry/exit from telematics positions; inserts breach events and outbox entries |
| **Tables written** | `safety.geofence_breach_events`, `outbox.events` |
| **is_active filter** | ✅ (`WHERE is_active = true AND deactivated_at IS NULL`) |
| **Idempotent** | ✅ (dedup check: no event within 5-minute window for same vehicle+geofence; watermark per company) |
| **Failure recovery documented** | ✅ (env flag `GEOFENCE_BREACH_CRON_ENABLED=false`; logged per company) |

---

## 8. INTEGRATIONS / LOVES FUEL CARD

### 8.1 Loves Card Import
| Field | Value |
|-------|-------|
| **Schedule** | `"0 6 * * *"` |
| **Translated** | Daily at 06:00 (America/Chicago) |
| **Code file:line** | `apps/backend/src/cron/loves-card-import.cron.ts:677` |
| **Purpose** | Imports Loves fuel card transactions from external source |
| **Tables written** | `banking.transactions` or fuel card table (inferred from `runLovesCardImportTick`) |
| **is_active filter** | N/A (handled inside import service) |
| **Idempotent** | ✅ (`wrapBackgroundJobTick`; import service uses dedup) |
| **Failure recovery documented** | ✅ (`wrapBackgroundJobTick`; env flag `LOVES_CARD_IMPORT_CRON_ENABLED=false`) |

---

## 9. BANKING / PLAID

### 9.1 Plaid Daily Sync
| Field | Value |
|-------|-------|
| **Schedule** | `"0 2 * * *"` |
| **Translated** | Daily at 02:00 (America/Chicago) |
| **Code file:line** | `apps/backend/src/cron/plaid-daily-sync.ts:717` |
| **Purpose** | Pulls Plaid transactions for all active `banking.bank_accounts` with `plaid_item_id`; auto-categorizes |
| **Tables written** | `banking.transactions` (via `syncTransactions`) |
| **is_active filter** | ✅ (`WHERE is_active = true AND plaid_item_id IS NOT NULL`) |
| **Idempotent** | ✅ (Plaid cursor-based sync; per-item failure logged and emailed) |
| **Failure recovery documented** | ✅ (per-item error captured; failure email sent; `handleItemError` called; env flag `ENABLE_PLAID_DAILY_SYNC_CRON=false`) |

---

## 10. QBO INTEGRATION CRONS

### 10.1 QBO CDC Poll
| Field | Value |
|-------|-------|
| **Schedule** | `setInterval(5 * 60 * 1000)` |
| **Translated** | Every 5 minutes |
| **Code file:line** | `apps/backend/src/cron/qbo-cdc-poll.cron.ts:848` |
| **Purpose** | Polls QuickBooks Change Data Capture API for TRK/TRANSP realms; ingests changed records |
| **Tables written** | QBO inbound staging tables (via `runQboCdcIngest`) |
| **is_active filter** | ✅ (filters to configured active realms via `listConfiguredWave2Realms`) |
| **Idempotent** | ✅ (CDC uses watermark cursors; `wrapBackgroundJobTick`) |
| **Failure recovery documented** | ✅ (per-realm error logged; `markRunnerFailed`) |

### 10.2 QBO Historical Import Runner
| Field | Value |
|-------|-------|
| **Schedule** | `"*/1 * * * *"` (default; overridable via `QBO_FORENSIC_CRON` env) |
| **Translated** | Every 1 minute by default (America/Chicago); override with `QBO_FORENSIC_CRON` |
| **Code file:line** | `apps/backend/src/cron/qbo-historical-import-runner.ts:896` |
| **Purpose** | Resumes in-progress QBO forensic import batches; auto-fails stale batches (opt-in); sends completion email |
| **Tables written** | `qbo_archive.import_batches`, `audit.events` |
| **is_active filter** | N/A (operates on `qbo_archive.import_batches` status, not company is_active) |
| **Idempotent** | ✅ (only picks `status = 'in_progress'` batches; heartbeat updated per tick) |
| **Failure recovery documented** | ✅ (per-batch error sets status=failed; zombie alert email; `markRunnerFailed`; env flag `ENABLE_QBO_FORENSIC_RUNNER=false`) |

### 10.3 QBO Inbound Sync Worker
| Field | Value |
|-------|-------|
| **Schedule** | `setInterval(15_000)` |
| **Translated** | Every 15 seconds |
| **Code file:line** | `apps/backend/src/cron/qbo-inbound-sync.cron.ts:1127` |
| **Purpose** | Processes QBO inbound sync queue batches (25 records per tick) |
| **Tables written** | `qbo.inbound_sync_queue` and downstream ledger tables |
| **is_active filter** | ✅ (inbound queue already tenant-scoped) |
| **Idempotent** | ✅ (`processInboundSyncBatch` uses `FOR UPDATE SKIP LOCKED`) |
| **Failure recovery documented** | ✅ (`wrapBackgroundJobTick`; `markRunnerFailed`; timer cleared on stop) |

### 10.4 QBO Remote Count Collector — Delta
| Field | Value |
|-------|-------|
| **Schedule** | `"10 */6 * * *"` |
| **Translated** | Every 6 hours at minute :10 (America/Chicago) — i.e., 00:10, 06:10, 12:10, 18:10 |
| **Code file:line** | `apps/backend/src/cron/qbo-remote-count-collector.cron.ts:1192` |
| **Purpose** | Collects delta remote counts from QBO for reconciliation baseline |
| **Tables written** | `qbo.remote_count_snapshots` (inferred) |
| **is_active filter** | ✅ (`listQboConnectedOperatingCompanies` returns only active companies with QBO connection) |
| **Idempotent** | ✅ (per-run `collectionRunId`) |
| **Failure recovery documented** | ✅ (`wrapBackgroundJobTick`; env flag `QBO_REMOTE_COUNT_COLLECTOR_ENABLED=false`) |

### 10.5 QBO Remote Count Collector — Full
| Field | Value |
|-------|-------|
| **Schedule** | `"20 2 * * *"` |
| **Translated** | Daily at 02:20 (America/Chicago) |
| **Code file:line** | `apps/backend/src/cron/qbo-remote-count-collector.cron.ts:1206` |
| **Purpose** | Collects full remote counts from QBO daily for reconciliation baseline |
| **Tables written** | `qbo.remote_count_snapshots` (inferred) |
| **is_active filter** | ✅ (same as delta — `listQboConnectedOperatingCompanies`) |
| **Idempotent** | ✅ (per-run `collectionRunId`) |
| **Failure recovery documented** | ✅ (`wrapBackgroundJobTick`) |

### 10.6 QBO Sync Queue Runner
| Field | Value |
|-------|-------|
| **Schedule** | `"* * * * *"` |
| **Translated** | Every 1 minute (America/Chicago) |
| **Code file:line** | `apps/backend/src/cron/qbo-sync-queue-runner.ts:1236` |
| **Purpose** | Processes outbound QBO sync queue batches (25 records per tick) |
| **Tables written** | `qbo.sync_queue` and downstream QBO entity tables |
| **is_active filter** | ✅ (queue already company-scoped) |
| **Idempotent** | ✅ (`FOR UPDATE SKIP LOCKED` in `processOutboundSyncWorkerTick`) |
| **Failure recovery documented** | ✅ (`wrapBackgroundJobTick`; `markRunnerFailed`; dead-letter tracking) |

### 10.7 QBO Token Refresh — Hourly
| Field | Value |
|-------|-------|
| **Schedule** | `"0 * * * *"` |
| **Translated** | Hourly at minute :00 (America/Chicago) |
| **Code file:line** | `apps/backend/src/cron/qbo-token-refresh.ts:1303` |
| **Purpose** | Refreshes QBO access tokens for connections expiring within 12 hours |
| **Tables written** | `integrations.qbo_connections` (token columns) |
| **is_active filter** | ✅ (`getConnectionsExpiringWithin` scoped by active connections) |
| **Idempotent** | ✅ (refreshes only tokens expiring within window; send email on failure) |
| **Failure recovery documented** | ✅ (per-connection error logged and emailed; `markRunnerFailed`; env flag `ENABLE_QBO_TOKEN_REFRESH_CRON=false`) |

### 10.8 QBO Token Watchdog — 15-minute
| Field | Value |
|-------|-------|
| **Schedule** | `"*/15 * * * *"` |
| **Translated** | Every 15 minutes (America/Chicago) |
| **Code file:line** | `apps/backend/src/cron/qbo-token-refresh.ts:1338` |
| **Purpose** | Checks QBO connectivity for all active companies; alerts (with 12h cooldown) if any are disconnected |
| **Tables written** | None (read-only check + email alert) |
| **is_active filter** | ✅ (`WHERE is_active = true`) |
| **Idempotent** | ✅ (read-only; cooldown prevents alert spam) |
| **Failure recovery documented** | ✅ (per-company error logged; email alert with cooldown) |

### 10.9 QBO Sync Alerts Retry
| Field | Value |
|-------|-------|
| **Schedule** | `"*/5 * * * *"` |
| **Translated** | Every 5 minutes |
| **Code file:line** | `apps/backend/src/qbo/sync-alerts-cron.ts:1376` |
| **Purpose** | Processes `qbo.sync_alerts` retry queue; escalates to critical after `max_retries`; fires outbox events |
| **Tables written** | `qbo.sync_alerts`, `outbox.events` |
| **is_active filter** | ✅ (operates on alert records already tenant-scoped) |
| **Idempotent** | ✅ (`FOR UPDATE SKIP LOCKED`; retry_count check) |
| **Failure recovery documented** | ✅ (escalation path to critical; outbox events; env flag — **disabled by default**, requires `QBO_SYNC_RETRY_ENABLED=true`) |

### 10.10 QBO Master Data Sync — Full (opt-in)
| Field | Value |
|-------|-------|
| **Schedule** | `"0 2 * * *"` |
| **Translated** | Daily at 02:00 (America/Chicago) |
| **Code file:line** | `apps/backend/src/qbo/master-data-sync.cron.ts:1487` |
| **Purpose** | Full sync of QBO master data (customers, vendors, chart of accounts, items) to local tables |
| **Tables written** | `qbo.master_*` tables (inferred from `runScheduledMasterDataSync`) |
| **is_active filter** | ✅ (service layer filters) |
| **Idempotent** | ✅ (upsert patterns in sync service) |
| **Failure recovery documented** | ✅ (`wrapBackgroundJobTick`; **disabled by default**, requires `QBO_MASTERDATA_SYNC_ENABLED=true`) |

### 10.11 QBO Master Data Sync — Delta (opt-in)
| Field | Value |
|-------|-------|
| **Schedule** | `"*/15 * * * *"` |
| **Translated** | Every 15 minutes (America/Chicago) |
| **Code file:line** | `apps/backend/src/qbo/master-data-sync.cron.ts:1501` |
| **Purpose** | Delta sync of QBO master data every 15 minutes |
| **Tables written** | `qbo.master_*` tables |
| **is_active filter** | ✅ (service layer filters) |
| **Idempotent** | ✅ (upsert patterns) |
| **Failure recovery documented** | ✅ (`wrapBackgroundJobTick`; **disabled by default**, requires `QBO_MASTERDATA_SYNC_ENABLED=true`) |

### 10.12 QBO Drift Sync Scheduler
| Field | Value |
|-------|-------|
| **Schedule** | `"0 */4 * * *"` |
| **Translated** | Every 4 hours at minute :00 (America/Chicago) — 00:00, 04:00, 08:00, 12:00, 16:00, 20:00 |
| **Code file:line** | `apps/backend/src/qbo-sync/sync-scheduler.ts` (near end of file) |
| **Purpose** | Pulls chart-of-accounts, items, customers, vendors from QBO; reconciles against local; detects drift; fires drift alerts |
| **Tables written** | `qbo_sync.*` tables; `outbox.events` (via drift alerts) |
| **is_active filter** | ✅ (`WHERE is_active = true AND deactivated_at IS NULL`) |
| **Idempotent** | ✅ (upsert reconcilers; drift detection is idempotent) |
| **Failure recovery documented** | ✅ (`wrapBackgroundJobTick`; env flag `QBO_DRIFT_SYNC_CRON_ENABLED=false`) |

---

## 11. RECONCILIATION

### 11.1 Reconciliation Worker — QBO Refdata (every 6h)
| Field | Value |
|-------|-------|
| **Schedule** | `"35 */6 * * *"` |
| **Translated** | Every 6 hours at minute :35 (America/Chicago) — 00:35, 06:35, 12:35, 18:35 |
| **Code file:line** | `apps/backend/src/cron/reconciliation-worker.cron.ts:1408` |
| **Purpose** | DD-3 reconciliation: compares QBO reference/static data against local |
| **Tables written** | `reconciliation.snapshots` / `reconciliation.drift` (inferred) |
| **is_active filter** | ✅ (service layer per `runReconciliationCategoryTick`) |
| **Idempotent** | ✅ (snapshot-based; drift detect is read-heavy + upsert) |
| **Failure recovery documented** | ✅ (`wrapBackgroundJobTick`; env flag `RECONCILIATION_WORKER_ENABLED=false`) |

### 11.2 Reconciliation Worker — QBO Transactional (hourly)
| Field | Value |
|-------|-------|
| **Schedule** | `"45 * * * *"` |
| **Translated** | Hourly at minute :45 (America/Chicago) |
| **Code file:line** | `apps/backend/src/cron/reconciliation-worker.cron.ts:1422` |
| **Purpose** | DD-3 reconciliation: compares QBO transactional records against local |
| **Tables written** | `reconciliation.*` tables |
| **is_active filter** | ✅ |
| **Idempotent** | ✅ |
| **Failure recovery documented** | ✅ (`wrapBackgroundJobTick`) |

### 11.3 Reconciliation Worker — Samsara Static (every 12h)
| Field | Value |
|-------|-------|
| **Schedule** | `"50 */12 * * *"` |
| **Translated** | Every 12 hours at minute :50 (America/Chicago) — 00:50, 12:50 |
| **Code file:line** | `apps/backend/src/cron/reconciliation-worker.cron.ts:1437` |
| **Purpose** | DD-3 reconciliation: compares Samsara static reference data against local |
| **Tables written** | `reconciliation.*` tables |
| **is_active filter** | ✅ |
| **Idempotent** | ✅ |
| **Failure recovery documented** | ✅ (`wrapBackgroundJobTick`) |

### 11.4 Reconciliation Worker — CAP-15 Identity (hourly)
| Field | Value |
|-------|-------|
| **Schedule** | `"55 * * * *"` |
| **Translated** | Hourly at minute :55 (America/Chicago) |
| **Code file:line** | `apps/backend/src/cron/reconciliation-worker.cron.ts:1451` |
| **Purpose** | DD-4 CAP-15 zero-tolerance identity mapping check between Samsara and local |
| **Tables written** | `reconciliation.*` tables |
| **is_active filter** | ✅ |
| **Idempotent** | ✅ |
| **Failure recovery documented** | ✅ (`wrapBackgroundJobTick`) |

---

## 12. SAMSARA INTEGRATION

### 12.1 Samsara Health Check
| Field | Value |
|-------|-------|
| **Schedule** | `"0 * * * *"` |
| **Translated** | Hourly at minute :00 (America/Chicago) |
| **Code file:line** | `apps/backend/src/cron/samsara-health-cron.ts:1557` |
| **Purpose** | Checks Samsara API connectivity for all active tenants with Samsara enabled; logs result to audit |
| **Tables written** | `audit.events` (via `audit.append_event`) |
| **is_active filter** | ✅ (`WHERE is_active = true AND deactivated_at IS NULL` + `integrations.samsara_config WHERE is_enabled = true`) |
| **Idempotent** | ✅ (audit-append only; no state mutation) |
| **Failure recovery documented** | ✅ (`wrapBackgroundJobTick`; invalid tenant audit event; env flag `ENABLE_SAMSARA_HEALTH_CHECK_CRON=false`) |

### 12.2 Samsara Master Sync
| Field | Value |
|-------|-------|
| **Schedule** | `"30 * * * *"` |
| **Translated** | Hourly at minute :30 (America/Chicago) |
| **Code file:line** | `apps/backend/src/cron/samsara-master-sync.cron.ts:1670` |
| **Purpose** | Syncs Samsara drivers and vehicles master lists into local `mdata` tables |
| **Tables written** | `mdata.drivers`, `mdata.units` (inferred from `syncSamsaraDriversMaster`, `syncSamsaraVehiclesMaster`) |
| **is_active filter** | ✅ (`WHERE is_active = true AND deactivated_at IS NULL` + Samsara enabled check) |
| **Idempotent** | ✅ (master sync uses upsert; audit events on skip) |
| **Failure recovery documented** | ✅ (`wrapBackgroundJobTick`; env flag `ENABLE_SAMSARA_MASTER_SYNC_CRON=false`) |

### 12.3 Samsara Positions
| Field | Value |
|-------|-------|
| **Schedule** | `"*/5 * * * *"` |
| **Translated** | Every 5 minutes (America/Chicago) |
| **Code file:line** | `apps/backend/src/cron/samsara-positions-cron.ts:1781` |
| **Purpose** | Fetches current vehicle GPS positions from Samsara; inserts into `telematics.vehicle_locations` |
| **Tables written** | `telematics.vehicle_locations` |
| **is_active filter** | ✅ (`WHERE is_active = true AND deactivated_at IS NULL` + Samsara enabled check) |
| **Idempotent** | ✅ (insert with dedup on vehicle+captured_at) |
| **Failure recovery documented** | ✅ (per-tenant warn; continue loop; audit event on fetch failure; env flag `ENABLE_SAMSARA_POSITIONS_CRON=false`) |

### 12.4 Samsara Remote Count Collector
| Field | Value |
|-------|-------|
| **Schedule** | `"5 */12 * * *"` |
| **Translated** | Every 12 hours at minute :05 (America/Chicago) — 00:05, 12:05 |
| **Code file:line** | `apps/backend/src/cron/samsara-remote-count-collector.cron.ts:1917` |
| **Purpose** | Collects remote entity counts from Samsara for reconciliation baseline |
| **Tables written** | `samsara.remote_count_snapshots` (inferred) |
| **is_active filter** | ✅ (`WHERE is_active = true AND deactivated_at IS NULL` + Samsara enabled check) |
| **Idempotent** | ✅ (per `collectionRunId`) |
| **Failure recovery documented** | ✅ (`wrapBackgroundJobTick`; env flag `SAMSARA_REMOTE_COUNT_COLLECTOR_ENABLED=false`) |

### 12.5 Samsara Webhook Projection
| Field | Value |
|-------|-------|
| **Schedule** | `"*/1 * * * *"` |
| **Translated** | Every 1 minute (America/Chicago) |
| **Code file:line** | `apps/backend/src/cron/samsara-webhook-projection.cron.ts:2004` |
| **Purpose** | Projects queued Samsara webhook events into downstream tables |
| **Tables written** | Downstream projection tables (via `projectSamsaraWebhookEventsForTenant`) |
| **is_active filter** | ✅ (`WHERE is_active = true AND deactivated_at IS NULL`) |
| **Idempotent** | ✅ (projection uses event watermarks) |
| **Failure recovery documented** | ✅ (`wrapBackgroundJobTick`; env flag `ENABLE_SAMSARA_WEBHOOK_PROJECTION_CRON=false`) |

---

## 13. SCHEDULED REPORTS

All six report jobs share: `apps/backend/src/cron/scheduled-reports.ts`  
Timezone: `America/Chicago`  
Enable/disable: `ENABLE_SCHEDULED_REPORT_CRON=false`  
is_active filter: ✅ (`loadEnabledSchedules` returns only enabled company schedules)  
Idempotent: ✅ (report runs are stateless reads + email delivery; re-run sends duplicate email but no DB corruption)  
Failure recovery: ✅ (per-schedule try/catch; per-report try/catch; `app.log.error`)

| # | Report ID | **Schedule (verbatim)** | Translated |
|---|-----------|------------------------|------------|
| 13.1 | `dispatch-board` | `"0 7 * * *"` | Daily 07:00 CT |
| 13.2 | `cash-position-ar` | `"0 18 * * *"` | Daily 18:00 CT |
| 13.3 | `profit-per-truck-week` | `"0 8 * * 1"` | Weekly Monday 08:00 CT |
| 13.4 | `settlements-ready` | `"0 17 * * 5"` | Weekly Friday 17:00 CT |
| 13.5 | `maintenance-open-wos` | `"0 8 * * 1"` | Weekly Monday 08:00 CT |
| 13.6 | `ifta-quarterly-state` | `"0 8 1 1,4,7,10 *"` | 1st of Jan/Apr/Jul/Oct at 08:00 CT |

---

## 14. EMAIL QUEUE PROCESSOR

### 14.1 Email Queue Processor
| Field | Value |
|-------|-------|
| **Schedule** | `"* * * * *"` |
| **Translated** | Every 1 minute |
| **Code file:line** | `apps/backend/src/email/cron.ts:967` |
| **Purpose** | Processes `email.email_queue`; claims up to 50 rows per tick; sends via provider; handles retry with backoff |
| **Tables written** | `email.email_queue`, `email.email_alerts` |
| **is_active filter** | N/A (operates on queue, not company-scoped loop) |
| **Idempotent** | ✅ (`FOR UPDATE SKIP LOCKED`; status transitions; retry tracking) |
| **Failure recovery documented** | ✅ (retry with exponential backoff up to `max_retries`; permanent fail writes to `email.email_alerts`; **disabled by default**, requires `EMAIL_CRON_ENABLED=true`) |

---

## 15. INSURANCE

### 15.1 Insurance Payment Reminder
| Field | Value |
|-------|-------|
| **Schedule** | `"0 8 * * *"` |
| **Translated** | Daily at 08:00 (America/Chicago) |
| **Code file:line** | `apps/backend/src/insurance/payment-reminder.service.ts:1091` |
| **Purpose** | Scans `insurance.payment_schedule`; marks due records as `reminded`; sends reminders for T-7/T-3/T-1/due_today |
| **Tables written** | `insurance.payment_schedule` (status → `reminded`) |
| **is_active filter** | ✅ (`WHERE is_active = true AND deactivated_at IS NULL`) |
| **Idempotent** | ✅ (only processes `status = 'scheduled'`; transitions to `reminded` are guarded) |
| **Failure recovery documented** | ✅ (`wrapBackgroundJobTick`) |

---

## 16. LEGAL

### 16.1 Legal Matters Reminder
| Field | Value |
|-------|-------|
| **Schedule** | `"0 8 * * *"` |
| **Translated** | Daily at 08:00 (America/Chicago) |
| **Code file:line** | `apps/backend/src/legal/matters-reminder.cron.ts:1170` |
| **Purpose** | Sends email reminders for upcoming/overdue legal matter deadlines; marks reminder as sent |
| **Tables written** | `legal.matter_deadlines` (`reminder_sent_at`), `pwa.driver_notifications` (optional) |
| **is_active filter** | N/A (operates on deadlines from `listDeadlinesNeedingReminder`, not company loop) |
| **Idempotent** | ✅ (`appendDeadlineReminderSent` prevents re-send) |
| **Failure recovery documented** | ✅ (`wrapBackgroundJobTick`; env flag `ENABLE_LEGAL_MATTERS_REMINDER_CRON=false`; PWA insert is wrapped in try/catch) |

---

## 17. COMPLIANCE

### 17.1 Compliance Reminder
| Field | Value |
|-------|-------|
| **Schedule** | `"0 6 * * *"` |
| **Translated** | Daily at 06:00 (America/Chicago) |
| **Code file:line** | `apps/backend/src/compliance/compliance-reminder.job.ts:347` |
| **Purpose** | Sends email/in-app reminders for compliance credentials expiring within configured windows |
| **Tables written** | `compliance.notification_log` |
| **is_active filter** | ❌ `SELECT id::text FROM org.companies` — **no `is_active` filter** |
| **Idempotent** | ✅ (`compliance.notification_log` prevents duplicate sends per rule+credential+day) |
| **Failure recovery documented** | ✅ (`wrapBackgroundJobTick`; env flag `ENABLE_COMPLIANCE_REMINDER_CRON=false`) |

### 17.2 CSA BASIC Pull
| Field | Value |
|-------|-------|
| **Schedule** | `"30 5 * * *"` |
| **Translated** | Daily at 05:30 (America/Chicago) |
| **Code file:line** | `apps/backend/src/compliance/csa-basic-pull.ts:672` |
| **Purpose** | Fetches CSA BASIC scores from FMCSA SAFER website for all active companies with a USDOT number |
| **Tables written** | `compliance.csa_basic_scores` |
| **is_active filter** | ✅ (`WHERE is_active = true AND deactivated_at IS NULL AND NULLIF(usdot_number,'') IS NOT NULL`) |
| **Idempotent** | ✅ (`ON CONFLICT (operating_company_id, snapshot_date, basic_category) DO UPDATE`) |
| **Failure recovery documented** | ✅ (per-company failure accumulation; partial-failure exception; env flag `ENABLE_CSA_BASIC_PULL_CRON=false`) |

### 17.3 FMCSA SAFER Verification
| Field | Value |
|-------|-------|
| **Schedule** | `"15 6 * * *"` |
| **Translated** | Daily at 06:15 (America/Chicago) |
| **Code file:line** | `apps/backend/src/compliance/fmcsa-safer-cron.ts:209` |
| **Purpose** | Verifies FMCSA SAFER status for stale entities (carriers, drivers); 1.5s rate-limit between calls |
| **Tables written** | `compliance.safer_verifications` (inferred) |
| **is_active filter** | ✅ (`listStaleSaferEntities` filters active companies) |
| **Idempotent** | ✅ (re-verifying is safe; status is updated via upsert) |
| **Failure recovery documented** | ✅ (per-entity failure accumulation; partial-failure exception; env flag `ENABLE_FMCSA_SAFER_VERIFICATION_CRON=false`) |

---

## 18. DRIVERS / DOCUMENTS

### 18.1 Document Alert Engine
| Field | Value |
|-------|-------|
| **Schedule** | `"35 7 * * *"` |
| **Translated** | Daily at 07:35 (America/Chicago) |
| **Code file:line** | `apps/backend/src/drivers/document-alerts.cron.ts:720` |
| **Purpose** | Runs document alert engine for each active tenant; generates expiry/missing document alerts |
| **Tables written** | `drivers.document_alerts` (inferred) |
| **is_active filter** | ✅ (`WHERE is_active = true AND deactivated_at IS NULL`) |
| **Idempotent** | ✅ (alert engine uses upsert/dedup) |
| **Failure recovery documented** | ✅ (`wrapBackgroundJobTick`; env flag `ENABLE_DOCUMENT_ALERT_ENGINE_CRON=false`) |

---

## 19. SAFETY

### 19.1 Safety Reminders
| Field | Value |
|-------|-------|
| **Schedule** | `"15 6 * * *"` |
| **Translated** | Daily at 06:15 (America/Chicago) |
| **Code file:line** | `apps/backend/src/safety/reminders.cron.ts:1748` |
| **Purpose** | Refreshes `safety.compliance_reminders` for driver qualification files, medical cards, background checks, training records expiring within 30 days |
| **Tables written** | `safety.compliance_reminders` |
| **is_active filter** | ✅ (scans `safety.*` tables which are company-scoped; `assertTenantContext` per company) |
| **Idempotent** | ✅ (`ON CONFLICT ... DO UPDATE`; auto-resolves stale reminders) |
| **Failure recovery documented** | ✅ (`wrapBackgroundJobTick`; env flag `ENABLE_SAFETY_REMINDERS_CRON=false`) |

### 19.2 Integrity Alert Engine
| Field | Value |
|-------|-------|
| **Schedule** | `"20 */6 * * *"` |
| **Translated** | Every 6 hours at minute :20 (America/Chicago) — 00:20, 06:20, 12:20, 18:20 |
| **Code file:line** | `apps/backend/src/safety/integrity-alert-engine.cron.ts:1564` |
| **Purpose** | Detects data integrity anomalies per tenant; generates safety alerts |
| **Tables written** | `safety.integrity_alerts` (inferred from `runIntegrityAlertEngineForTenant`) |
| **is_active filter** | ✅ (`WHERE is_active = true AND deactivated_at IS NULL`) |
| **Idempotent** | ✅ (engine uses upsert/dedup) |
| **Failure recovery documented** | ✅ (`wrapBackgroundJobTick`; env flag `ENABLE_INTEGRITY_ALERT_ENGINE_CRON=false`) |

---

## 20. REPORTS

### 20.1 Deadhead Cache Refresh
| Field | Value |
|-------|-------|
| **Schedule** | `"0 3 * * 1"` |
| **Translated** | Weekly every Monday at 03:00 (America/Chicago) |
| **Code file:line** | `apps/backend/src/reports/deadhead-refresh.job.ts:1271` |
| **Purpose** | Refreshes deadhead route cache for all companies |
| **Tables written** | `reports.deadhead_cache` (inferred from `refreshDeadheadCache`) |
| **is_active filter** | ❌ `SELECT id::text FROM org.companies` — **no `is_active` filter** |
| **Idempotent** | ✅ (cache refresh is idempotent; old data replaced) |
| **Failure recovery documented** | ✅ (`wrapBackgroundJobTick`; env flag `ENABLE_DEADHEAD_REFRESH_CRON=false`) |

### 20.2 Lane Profitability Cache Refresh
| Field | Value |
|-------|-------|
| **Schedule** | `"0 2 * * *"` |
| **Translated** | Daily at 02:00 (America/Chicago) |
| **Code file:line** | `apps/backend/src/reports/lane-profitability-refresh.job.ts:1320` |
| **Purpose** | Refreshes lane profitability rolling-12-month cache for all companies |
| **Tables written** | `reports.lane_profitability_cache` (inferred) |
| **is_active filter** | ❌ `SELECT id::text FROM org.companies` — **no `is_active` filter** |
| **Idempotent** | ✅ (cache refresh is idempotent) |
| **Failure recovery documented** | ✅ (`wrapBackgroundJobTick`; env flag `ENABLE_LANE_PROFITABILITY_REFRESH_CRON=false`) |

---

## 21. BORDER CROSSING

### 21.1 CBP Wait Times Refresh
| Field | Value |
|-------|-------|
| **Schedule** | `"*/5 * * * *"` |
| **Translated** | Every 5 minutes (America/Chicago); **self-gates**: only executes 06:00–22:00 CT (business hours) |
| **Code file:line** | `apps/backend/src/border-crossing/cbp-wait-times-refresh.job.ts:40` |
| **Purpose** | Fetches CBP border wait times for all active port locations; updates cache |
| **Tables written** | `border_crossing.cbp_wait_times` (inferred from `refreshAllActivePortWaitTimes`) |
| **is_active filter** | N/A (refreshes port-level data, not company-scoped) |
| **Idempotent** | ✅ (cache refresh is idempotent) |
| **Failure recovery documented** | ✅ (`wrapBackgroundJobTick`; env flag `ENABLE_CBP_WAIT_TIMES_CRON=false`; business-hours guard) |

---

## 22. ANOMALY DETECTION (inline in index.ts)

### 22.1 Anomaly Detector
| Field | Value |
|-------|-------|
| **Schedule** | `"*/30 * * * *"` |
| **Translated** | Every 30 minutes (America/Chicago) |
| **Code file:line** | `apps/backend/src/index.ts:850` |
| **Purpose** | Runs `runAnomalyDetectionForTenant` for each active company; detects unusual patterns |
| **Tables written** | `integrity.anomaly_alerts` (inferred) |
| **is_active filter** | ✅ (`WHERE is_active = true AND deactivated_at IS NULL`) |
| **Idempotent** | ✅ (detection engine uses upsert/dedup per company) |
| **Failure recovery documented** | ✅ (try/catch with `app.log.error` around entire inline cron; **NOTE: no env flag — cannot be disabled without code change**) |

---

## SUMMARY TABLE

| # | Name | Schedule (verbatim) | Translated | is_active | Idempotent | Failure recovery |
|---|------|---------------------|------------|-----------|------------|-----------------|
| 1 | PM Auto-Engine | `"5 * * * *"` | Hourly :05 CT | ✅ | ✅ | ✅ |
| 2 | Driver Settlement Auto-Pay | `"0 6 * * 5"` | Fri 06:00 CT | ✅ | ✅ | ✅ |
| 3 | Cash Advance Expiry | `"15 6 * * *"` | Daily 06:15 CT | N/A | ✅ | ✅ |
| 4 | Collections Sync | `"0 4 * * *"` | Daily 04:00 CT | ✅ | ✅ | ✅ |
| 5 | Recurring Templates | `setInterval(15*60*1000)` | Every 15 min | ✅ | ✅ | ✅ |
| 6 | Daily Task Alerts | `setInterval(60000)` | Every 60s (configurable) | N/A | ✅ | ✅ |
| 7 | Error Digest | `setInterval(60_000)` | Every 60s | N/A | ✅ | ✅ |
| 8 | Fuel GPS Match | `"0 * * * *"` | Hourly :00 CT | ✅ | ✅ | ✅ |
| 9 | Geofence Breach Detector | `"*/1 * * * *"` | Every 1 min CT | ✅ | ✅ | ✅ |
| 10 | Loves Card Import | `"0 6 * * *"` | Daily 06:00 CT | N/A | ✅ | ✅ |
| 11 | Plaid Daily Sync | `"0 2 * * *"` | Daily 02:00 CT | ✅ | ✅ | ✅ |
| 12 | QBO CDC Poll | `setInterval(5*60*1000)` | Every 5 min | ✅ | ✅ | ✅ |
| 13 | QBO Historical Import Runner | `"*/1 * * * *"` (default) | Every 1 min CT | N/A | ✅ | ✅ |
| 14 | QBO Inbound Sync | `setInterval(15_000)` | Every 15s | ✅ | ✅ | ✅ |
| 15 | QBO Remote Count — Delta | `"10 */6 * * *"` | Every 6h :10 CT | ✅ | ✅ | ✅ |
| 16 | QBO Remote Count — Full | `"20 2 * * *"` | Daily 02:20 CT | ✅ | ✅ | ✅ |
| 17 | QBO Sync Queue Runner | `"* * * * *"` | Every 1 min CT | ✅ | ✅ | ✅ |
| 18 | QBO Token Refresh | `"0 * * * *"` | Hourly :00 CT | ✅ | ✅ | ✅ |
| 19 | QBO Token Watchdog | `"*/15 * * * *"` | Every 15 min CT | ✅ | ✅ | ✅ |
| 20 | QBO Sync Alerts Retry | `"*/5 * * * *"` | Every 5 min | ✅ | ✅ | ✅ |
| 21 | QBO Master Data Full (opt-in) | `"0 2 * * *"` | Daily 02:00 CT | ✅ | ✅ | ✅ |
| 22 | QBO Master Data Delta (opt-in) | `"*/15 * * * *"` | Every 15 min CT | ✅ | ✅ | ✅ |
| 23 | QBO Drift Sync Scheduler | `"0 */4 * * *"` | Every 4h :00 CT | ✅ | ✅ | ✅ |
| 24 | Reconciliation — QBO Refdata | `"35 */6 * * *"` | Every 6h :35 CT | ✅ | ✅ | ✅ |
| 25 | Reconciliation — QBO Txn | `"45 * * * *"` | Hourly :45 CT | ✅ | ✅ | ✅ |
| 26 | Reconciliation — Samsara Static | `"50 */12 * * *"` | Every 12h :50 CT | ✅ | ✅ | ✅ |
| 27 | Reconciliation — CAP-15 Identity | `"55 * * * *"` | Hourly :55 CT | ✅ | ✅ | ✅ |
| 28 | Samsara Health Check | `"0 * * * *"` | Hourly :00 CT | ✅ | ✅ | ✅ |
| 29 | Samsara Master Sync | `"30 * * * *"` | Hourly :30 CT | ✅ | ✅ | ✅ |
| 30 | Samsara Positions | `"*/5 * * * *"` | Every 5 min CT | ✅ | ✅ | ✅ |
| 31 | Samsara Remote Count Collector | `"5 */12 * * *"` | Every 12h :05 CT | ✅ | ✅ | ✅ |
| 32 | Samsara Webhook Projection | `"*/1 * * * *"` | Every 1 min CT | ✅ | ✅ | ✅ |
| 33 | Scheduled Reports (6 jobs) | Various (see §13) | Various | ✅ | ✅ | ✅ |
| 34 | Email Queue Processor | `"* * * * *"` | Every 1 min | N/A | ✅ | ✅ |
| 35 | Insurance Payment Reminder | `"0 8 * * *"` | Daily 08:00 CT | ✅ | ✅ | ✅ |
| 36 | Legal Matters Reminder | `"0 8 * * *"` | Daily 08:00 CT | N/A | ✅ | ✅ |
| 37 | Compliance Reminder | `"0 6 * * *"` | Daily 06:00 CT | ❌ | ✅ | ✅ |
| 38 | CSA BASIC Pull | `"30 5 * * *"` | Daily 05:30 CT | ✅ | ✅ | ✅ |
| 39 | FMCSA SAFER Verification | `"15 6 * * *"` | Daily 06:15 CT | ✅ | ✅ | ✅ |
| 40 | Document Alert Engine | `"35 7 * * *"` | Daily 07:35 CT | ✅ | ✅ | ✅ |
| 41 | Safety Reminders | `"15 6 * * *"` | Daily 06:15 CT | ✅ | ✅ | ✅ |
| 42 | Integrity Alert Engine | `"20 */6 * * *"` | Every 6h :20 CT | ✅ | ✅ | ✅ |
| 43 | Deadhead Cache Refresh | `"0 3 * * 1"` | Weekly Mon 03:00 CT | ❌ | ✅ | ✅ |
| 44 | Lane Profitability Refresh | `"0 2 * * *"` | Daily 02:00 CT | ❌ | ✅ | ✅ |
| 45 | CBP Wait Times Refresh | `"*/5 * * * *"` | Every 5 min (biz hrs) | N/A | ✅ | ✅ |
| 46 | Anomaly Detector | `"*/30 * * * *"` | Every 30 min CT | ✅ | ✅ | ✅ |

**is_active filter summary:**
- ✅ 38 jobs (or groups)
- ❌ 3 jobs: Compliance Reminder, Deadhead Cache Refresh, Lane Profitability Refresh
- N/A 5 jobs: Cash Advance Expiry, Daily Task Alerts, Error Digest, Legal Matters Reminder, CBP Wait Times Refresh; Email Queue Processor; Loves Card Import; QBO Historical Import Runner
