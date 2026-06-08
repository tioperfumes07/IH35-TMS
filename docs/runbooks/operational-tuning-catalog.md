# Operational Tuning Catalog — IH35 TMS

**Block:** BLOCK-13-TIER2-TUNING-CATALOG  
**Updated:** 2026-06-08  
**Owner:** Platform / Jorge

Single reference for every tunable operational parameter.

**Related:** [CRON inventory](../audits/CRON-INVENTORY-2026-06-06.md) · [Monitoring playbook](./MONITORING-PLAYBOOK.md)

---

## Cron schedules

### PM Auto-Engine tick
- Current value: `"5 * * * *"` (hourly at :05, America/Chicago)
- Location: `apps/backend/src/maintenance/pm-auto-engine.cron.ts:19`
- Why this value: Spreads PM evaluation off the top of the hour; hourly sufficient for 300-truck fleet
- How to change: Edit cron expression; set `ENABLE_PM_AUTO_ENGINE_CRON=false` to disable; redeploy backend
- Impact of changing: Faster cadence increases DB load; slower delays auto-WO creation
- Last changed: 2026-06-06 by Cursor audit from existing source (unchanged)

### Driver settlement auto-pay
- Current value: `"0 6 * * 5"` (Fridays 06:00 Chicago)
- Location: `apps/backend/src/driver-finance/auto-pay.cron.ts:46`
- Why this value: Weekly payroll alignment; Friday morning before banking cutoff
- How to change: Edit cron; redeploy backend
- Impact of changing: Wrong day causes settlement/payment timing drift
- Last changed: 2026-06-06 by Cursor audit (unchanged)

### Cash advance request expiry
- Current value: `"15 6 * * *"` (daily 06:15 Chicago)
- Location: `apps/backend/src/cron/cash-advance-request-expiry-cron.ts:22`
- Why this value: Runs after daily batch jobs; expires stale pending requests once per day
- How to change: Edit schedule; `ENABLE_CASH_ADVANCE_REQUEST_EXPIRY_CRON=false`
- Impact of changing: Less frequent runs leave expired requests visible longer
- Last changed: 2026-06-06 by Cursor audit (unchanged)

### Collections sync
- Current value: `"0 4 * * *"` (daily 04:00 Chicago)
- Location: `apps/backend/src/cron/collections-sync.cron.ts:51`
- Why this value: Pre-dawn sync before dispatch shift
- How to change: Edit cron; `ACCOUNTING_COLLECTIONS_SYNC_ENABLED=false`
- Impact of changing: Delays AR collections task freshness
- Last changed: 2026-06-06 by Cursor audit (unchanged)

### Recurring templates materialization
- Current value: `setInterval(15 * 60 * 1000)` (every 15 minutes)
- Location: `apps/backend/src/cron/recurring-templates.cron.ts:1478`
- Why this value: Balances timeliness vs DB write load
- How to change: Change interval constant; redeploy
- Impact of changing: Shorter interval increases CPU
- Last changed: 2026-06-06 by Cursor audit (unchanged)

### Daily task alerts poll
- Current value: `DAILY_TASK_ALERTS_INTERVAL_MS` default 60000 (min 10000)
- Location: `apps/backend/src/cron/daily-task-alerts.cron.ts:277`
- Why this value: 1-minute poll catches 2-hour due window
- How to change: Set env `DAILY_TASK_ALERTS_INTERVAL_MS`
- Impact of changing: Slower poll delays overdue notifications
- Last changed: 2026-06-06 by Cursor audit (unchanged)

### Fuel GPS match
- Current value: `"0 * * * *"` (hourly :00 Chicago)
- Location: `apps/backend/src/cron/fuel-gps-match.cron.ts:352`
- Why this value: Hourly fraud/GPS correlation sufficient
- How to change: Edit cron; `FUEL_GPS_MATCH_CRON_ENABLED=false`
- Impact of changing: Slower delays fraud alerts
- Last changed: 2026-06-06 by Cursor audit (unchanged)

### Geofence breach detector
- Current value: `"*/1 * * * *"` (every minute Chicago)
- Location: `apps/backend/src/cron/geofence-breach-detector.cron.ts:628`
- Why this value: Near-real-time breach detection for detention/safety
- How to change: Edit cron expression; redeploy
- Impact of changing: >1 min delays breach notifications
- Last changed: 2026-06-06 by Cursor audit (unchanged)

### QBO customers push scheduler
- Current value: `QBO_CUSTOMERS_PUSH_INTERVAL_MS = 60_000`
- Location: `apps/backend/src/sync/qbo-customers-push.ts`
- Why this value: Near-real-time master-data push sharing rate budget
- How to change: Edit interval constant; redeploy
- Impact of changing: Faster risks QBO 429; slower increases sync lag
- Last changed: 2026-06-08 by BLOCK-13 catalog

### Border crossing detector worker
- Current value: default 300000 ms (5 min)
- Location: `apps/backend/src/jobs/border-crossing-detector.ts:9`
- Why this value: Balances cross-border detection vs API cost
- How to change: Set env `BORDER_CROSSING_DETECTOR_INTERVAL_MS` (min 60000)
- Impact of changing: Slower misses short crossings
- Last changed: 2026-06-08 by BLOCK-13 catalog

---

## Rate limits

### QBO master push shared ceiling
- Current value: 100 pushes per rolling 60 seconds
- Location: `apps/backend/src/sync/qbo-master-push-rate-limit.ts:2`
- Why this value: Intuit throttle headroom across customers/vendors/accounts
- How to change: Edit `QBO_MASTER_PUSH_RATE_LIMIT_PER_MIN`; redeploy
- Impact of changing: Higher risks 429; lower increases backlog
- Last changed: 2026-06-08 by BLOCK-13 catalog

### QBO API client retry backoff
- Current value: `[1000, 2000, 4000, 8000, 16000]` ms, max 5 retries
- Location: `apps/backend/src/integrations/qbo/qbo-client.ts:20`
- Why this value: Exponential backoff aligned with Intuit guidance
- How to change: Edit `RETRY_DELAYS_MS` / `MAX_RETRIES`
- Impact of changing: Fewer retries fail faster under outage
- Last changed: 2026-06-08 by BLOCK-13 catalog

### Bulk unit update rate cap
- Current value: 100 units per bulk-update request
- Location: Fleet bulk API contract in blueprint docs
- Why this value: Prevents long transactions and audit storms
- How to change: Update route validation + docs
- Impact of changing: Higher batch risks timeout
- Last changed: 2026-06-08 by BLOCK-13 catalog

### Idempotency key dedup window
- Current value: 24 hours TTL
- Location: `apps/backend/src/middleware/idempotency.ts:30`
- Why this value: Covers mobile/offline retry window
- How to change: Edit `TTL_INTERVAL` constant
- Impact of changing: Shorter TTL allows duplicate mutations
- Last changed: 2026-06-08 by BLOCK-13 catalog

### Circuit breaker QBO open threshold
- Current value: 5 failures in 30s → open 60s
- Location: `apps/backend/src/lib/circuit-breaker/registry.ts`
- Why this value: Tolerates transient Intuit blips
- How to change: Edit breaker config; update degradation runbook
- Impact of changing: False positives cause fast-fail
- Last changed: 2026-06-08 by BLOCK-05 implementation

### Circuit breaker Samsara open threshold
- Current value: 3 failures in 30s → open 30s
- Location: `apps/backend/src/lib/circuit-breaker/registry.ts`
- Why this value: Read-mostly telematics; faster recovery OK
- How to change: Edit registry config; redeploy
- Impact of changing: Affects live map/HOS during outage
- Last changed: 2026-06-08 by BLOCK-05 implementation

---

## Retry counts

### QBO HTTP max retries
- Current value: 5 attempts on 429/503
- Location: `apps/backend/src/integrations/qbo/qbo-client.ts:19`
- Why this value: ~31s max backoff before surfacing error
- How to change: Edit `MAX_RETRIES`
- Impact of changing: Outbox dead-letter timing shifts
- Last changed: 2026-06-08 by BLOCK-13 catalog

### QBO master push dead-letter
- Current value: 5 failed attempts
- Location: `apps/backend/src/sync/qbo-customers-push.ts`
- Why this value: Surfaces chronic sync failures without infinite retry
- How to change: Edit dead-letter threshold in push schedulers
- Impact of changing: Alert timing for bad rows
- Last changed: 2026-06-08 by BLOCK-13 catalog

### Outbox delivery max attempts
- Current value: 5–10 per handler (handler-specific)
- Location: `apps/backend/src/outbox/` handlers
- Why this value: At-least-once with DLQ escape hatch
- How to change: Per-handler `maxAttempts`
- Impact of changing: Backlog drain under partial outage
- Last changed: 2026-06-08 by BLOCK-13 catalog

### Plaid API retries
- Current value: SDK default + app-level error surfacing
- Location: `apps/backend/src/integrations/plaid/plaid.service.ts`
- Why this value: Banking re-link is user-triggered
- How to change: Add explicit retry wrapper if extending
- Impact of changing: May mask expired credentials
- Last changed: 2026-06-08 by BLOCK-13 catalog

### Anthropic photo comparison retries
- Current value: Single attempt, 30s timeout
- Location: `apps/backend/src/safety/photo-comparison/anthropic-client.ts:69`
- Why this value: Vision calls expensive; breaker preferred
- How to change: Edit client timeout policy
- Impact of changing: Blocks WO photo comparison UI if too short
- Last changed: 2026-06-08 by BLOCK-13 catalog

### Geofence reconciliation retry
- Current value: 1 run/day, next day retries
- Location: `apps/backend/src/jobs/geofence-reconciliation-daily.ts`
- Why this value: Daily batch sufficient for drift detection
- How to change: Edit cron schedule
- Impact of changing: Delays integrity finding resolution
- Last changed: 2026-06-08 by BLOCK-13 catalog

---

## Timeouts

### Migration verification boot timeout
- Current value: 10000 ms
- Location: `apps/backend/src/index.ts:460`
- Why this value: Fail-fast if migrate verification hangs
- How to change: Edit timeout in boot path
- Impact of changing: False deploy failures if too short
- Last changed: 2026-06-08 by BLOCK-13 catalog

### Anthropic vision API timeout
- Current value: 30000 ms
- Location: `apps/backend/src/safety/photo-comparison/anthropic-client.ts:69`
- Why this value: Vision models can be slow
- How to change: `timeoutMs` option
- Impact of changing: False timeouts on large images
- Last changed: 2026-06-08 by BLOCK-13 catalog

### Multi-tenant verify health poll
- Current value: 20000 ms
- Location: `scripts/db-verify-multi-tenant.mjs:68`
- Why this value: CI waits for backend healthcheck
- How to change: Edit `waitForHealth` timeoutMs
- Impact of changing: CI flake if too short
- Last changed: 2026-06-08 by BLOCK-13 catalog

### Playwright webServer startup
- Current value: 120000 ms
- Location: `apps/frontend/playwright.config.ts:18`
- Why this value: Vite dev server slow in CI
- How to change: Edit playwright `webServer.timeout`
- Impact of changing: E2E CI failures
- Last changed: 2026-06-08 by BLOCK-13 catalog

### CI postgres health retries
- Current value: 5 retries, 5s interval
- Location: `.github/workflows/ci.yml` postgres service
- Why this value: Standard GHA postgres readiness
- How to change: Edit workflow service options
- Impact of changing: Migration verify flakes
- Last changed: 2026-06-08 by BLOCK-13 catalog

### Deep health sequential checks
- Current value: No explicit per-check timeout (sequential await)
- Location: `apps/backend/src/observability/health-deep.routes.ts`
- Why this value: 503 if any dependency fails
- How to change: Add per-check timeout wrapper
- Impact of changing: Uptime monitor behavior
- Last changed: 2026-06-08 by BLOCK-13 catalog

---

## Cache TTLs

### Samsara tier-1 realtime cache
- Current value: 5000 ms
- Location: `apps/backend/src/lib/cache-tiers.ts:6`
- Why this value: Live dispatch board needs sub-5s freshness
- How to change: Edit `TIER_1_REALTIME_MAX_AGE_MS`
- Impact of changing: Stale map pins vs API cost
- Last changed: 2026-06-08 by BLOCK-13 catalog

### Samsara tier-2 cache
- Current value: 30000 ms
- Location: `apps/backend/src/lib/cache-tiers.ts:7`
- Why this value: Secondary telematics reads tolerate 30s staleness
- How to change: Edit `TIER_2_30S_MAX_AGE_MS`
- Impact of changing: Fleet list enrichment latency
- Last changed: 2026-06-08 by BLOCK-13 catalog

### Samsara tier-3 cache
- Current value: 300000 ms (5 min)
- Location: `apps/backend/src/lib/cache-tiers.ts:8`
- Why this value: Historical/summary views
- How to change: Edit `TIER_3_5MIN_MAX_AGE_MS`
- Impact of changing: Report freshness tradeoff
- Last changed: 2026-06-08 by BLOCK-13 catalog

### Samsara tier-4 cache
- Current value: 900000 ms (15 min)
- Location: `apps/backend/src/lib/cache-tiers.ts:9`
- Why this value: Cold/reference telematics data
- How to change: Edit `TIER_4_15MIN_MAX_AGE_MS`
- Impact of changing: Background refresh timing
- Last changed: 2026-06-08 by BLOCK-13 catalog

### Form 425c exhibit PDF cache
- Current value: 86400000 ms (24 hours)
- Location: `apps/backend/src/reports/form-425c/exhibits/exhibits-builder.service.ts:11`
- Why this value: Exhibits immutable per filing UUID for a day
- How to change: Edit `EXHIBIT_CACHE_TTL_MS`
- Impact of changing: Stale PDF if filing amended same day
- Last changed: 2026-06-08 by BLOCK-13 catalog

### Booking gap aggregator interval
- Current value: default 21600000 ms (6 hours)
- Location: `apps/backend/src/jobs/booking-gap-aggregator-worker.ts:10`
- Why this value: Analytics aggregation not real-time critical
- How to change: Set env `BOOKING_GAP_AGGREGATOR_INTERVAL_MS`
- Impact of changing: Dashboard gap metrics freshness
- Last changed: 2026-06-08 by BLOCK-13 catalog

---

## Batch sizes

### QBO customers push batch
- Current value: 100 rows per tick
- Location: `apps/backend/src/sync/qbo-customers-push.ts`
- Why this value: Matches rate limit; SKIP LOCKED claim size
- How to change: Edit `QBO_CUSTOMERS_PUSH_BATCH_SIZE`
- Impact of changing: Tick duration under load
- Last changed: 2026-06-08 by BLOCK-13 catalog

### QBO vendors push batch
- Current value: 100 rows per tick
- Location: `apps/backend/src/sync/qbo-vendors-push.ts`
- Why this value: Shared scheduler pattern with customers
- How to change: Edit `QBO_VENDORS_PUSH_BATCH_SIZE`
- Impact of changing: Vendor sync lag
- Last changed: 2026-06-08 by BLOCK-13 catalog

### QBO accounts push batch
- Current value: 100 rows per tick (parent-first two-pass)
- Location: `apps/backend/src/sync/qbo-accounts-push.ts`
- Why this value: Hierarchy requires parent-before-child
- How to change: Edit `QBO_ACCOUNTS_PUSH_BATCH_SIZE`
- Impact of changing: Blocked children if batch too small
- Last changed: 2026-06-08 by BLOCK-13 catalog

### Recurring templates per tick
- Current value: 50 templates per 15-min tick
- Location: `apps/backend/src/cron/recurring-templates.cron.ts`
- Why this value: Prevents single tick monopolizing DB
- How to change: Edit batch limit in tick function
- Impact of changing: Template backlog drain rate
- Last changed: 2026-06-08 by BLOCK-13 catalog

### Load test dispatch board concurrency
- Current value: 50 concurrent sessions (k6)
- Location: `tests/load/dispatch-board-realtime.js`
- Why this value: BLOCK-08 baseline for dispatcher scale
- How to change: Edit k6 script VUs
- Impact of changing: Nightly regression sensitivity
- Last changed: 2026-06-08 by BLOCK-08 implementation

### Load test driver PWA sync concurrency
- Current value: 300 concurrent requests (k6)
- Location: `tests/load/driver-pwa-sync.js`
- Why this value: 300-truck fleet PWA sync baseline
- How to change: Edit k6 script VUs
- Impact of changing: Load test pass/fail bar
- Last changed: 2026-06-08 by BLOCK-08 implementation

---

## Reconciliation thresholds

### Settlement minimum net floor
- Current value: 50% default (`SETTLEMENT_MIN_NET_PCT`)
- Location: `apps/backend/src/driver-finance/settlement-deduction-cap.service.ts:20`
- Why this value: Driver must retain minimum net pay
- How to change: Set env `SETTLEMENT_MIN_NET_PCT`; redeploy
- Impact of changing: Compliance risk if too low
- Last changed: 2026-06-08 by BLOCK-13 catalog

### QBO sync drift acceptable guard
- Current value: CI rules in verify script
- Location: `scripts/verify-qbo-sync-drift-acceptable.mjs`
- Why this value: Blocks harmful drift regressions
- How to change: Update verify allowlist/thresholds
- Impact of changing: CI false pass/fail
- Last changed: 2026-06-08 by BLOCK-13 catalog

### Bank reconciliation auto-match
- Current value: Per matching rules in banking module
- Location: `docs/runbooks/BANK-RECONCILIATION.md`
- Why this value: Balance automation vs false match
- How to change: Update matching service thresholds
- Impact of changing: Miscategorization risk
- Last changed: 2026-06-08 by BLOCK-13 catalog

### Geofence integrity reconciliation
- Current value: Daily batch flags drift for review
- Location: `apps/backend/src/jobs/geofence-reconciliation-daily.ts`
- Why this value: GPS drift is operational review not auto-delete
- How to change: Edit reconciliation rules
- Impact of changing: Alert noise vs missed issues
- Last changed: 2026-06-08 by BLOCK-13 catalog

### Double-entry balance tolerance
- Current value: 0 (exact balance required)
- Location: `accounting.ensure_journal_entry_balanced()` trigger
- Why this value: GL integrity invariant
- How to change: Finance approval + migration (not recommended)
- Impact of changing: Breaks accounting integrity
- Last changed: 2026-06-08 by BLOCK-13 catalog

### CSA score pull recency guard
- Current value: Enforced in CI verify script
- Location: `scripts/verify-csa-score-pull-recency.mjs`
- Why this value: Safety dashboard needs fresh FMCSA data
- How to change: Edit max age in verify script
- Impact of changing: Stale CSA in production UI
- Last changed: 2026-06-08 by BLOCK-13 catalog

---

## Alert thresholds

### Error digest spike threshold
- Current value: >10 errors/min
- Location: `apps/backend/src/cron/error-digest.cron.ts`
- Why this value: Early deploy/dependency regression signal
- How to change: Edit threshold in error-digest cron
- Impact of changing: Alert noise vs detection speed
- Last changed: 2026-06-06 by CRON inventory audit

### Deep health QBO staleness
- Current value: Last sync < 1 hour
- Location: `apps/backend/src/observability/health-deep.routes.ts`
- Why this value: Accounting depends on hourly sync
- How to change: Edit `checkQuickBooks` threshold
- Impact of changing: False uptime vs stale accounting
- Last changed: 2026-06-08 by BLOCK-13 catalog

### Deep health Plaid staleness
- Current value: `last_synced_at` < 24 hours
- Location: `apps/backend/src/observability/health-deep.routes.ts`
- Why this value: Daily banking sync sufficient
- How to change: Edit plaid check threshold
- Impact of changing: Stale banking while healthy
- Last changed: 2026-06-08 by BLOCK-13 catalog

### Load test p95 regression alert
- Current value: >20% regression vs baseline fails nightly
- Location: `.github/workflows/load-test-nightly.yml`
- Why this value: BLOCK-08 performance guard
- How to change: Edit workflow comparison step
- Impact of changing: CI noise vs missed regressions
- Last changed: 2026-06-08 by BLOCK-08 implementation

### Sentry slow query threshold
- Current value: >2000 ms
- Location: Sentry project + MONITORING-PLAYBOOK
- Why this value: Surfaces report SQL outliers
- How to change: Sentry performance settings
- Impact of changing: Alert volume
- Last changed: 2026-06-05 by CLOSURE-21 monitoring

### Daily task due-soon window
- Current value: 2 hours before due
- Location: `apps/backend/src/cron/daily-task-alerts.cron.ts`
- Why this value: Actionable lead time for dispatchers
- How to change: Edit due-soon constant
- Impact of changing: Warning lead time
- Last changed: 2026-06-06 by CRON inventory audit
