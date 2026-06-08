# Operational Tuning Catalog — IH35 TMS

**Block:** BLOCK-13-TIER2-TUNING-CATALOG  
**Updated:** 2026-06-08  
**Owner:** Platform / Jorge

Single source of truth for operational tuning knobs. Values are pulled from current source files and the cron inventory audit.

**Related:** [CRON inventory](../audits/CRON-INVENTORY-2026-06-06.md) · [Monitoring playbook](./MONITORING-PLAYBOOK.md)

---

## Cron schedules

### PM Auto-Engine cadence
- Current value: `"5 * * * *"` (hourly at minute :05, America/Chicago)
- Location: `docs/audits/CRON-INVENTORY-2026-06-06.md` (`apps/backend/src/maintenance/pm-auto-engine.cron.ts`)
- Why this value: Runs soon after each hour while avoiding top-of-hour contention with other jobs
- How to change: Update cron expression in PM cron module, keep timezone `America/Chicago`, then redeploy
- Impact of changing: Faster cadence increases write load; slower cadence delays PM work-order creation
- Last changed: Unknown in git history; cataloged 2026-06-08 by BLOCK-13

### Driver settlement auto-pay cadence
- Current value: `"0 6 * * 5"` (Friday 06:00, America/Chicago)
- Location: `docs/audits/CRON-INVENTORY-2026-06-06.md` (`apps/backend/src/driver-finance/auto-pay.cron.ts`)
- Why this value: Aligns with weekly payout rhythm and morning banking window
- How to change: Edit cron expression in driver finance auto-pay cron and redeploy
- Impact of changing: Can move cash outflow earlier/later and affect settlement expectations
- Last changed: Unknown in git history; cataloged 2026-06-08 by BLOCK-13

### Collections sync cadence
- Current value: `"0 4 * * *"` (daily 04:00, America/Chicago)
- Location: `docs/audits/CRON-INVENTORY-2026-06-06.md` (`apps/backend/src/cron/collections-sync.cron.ts`)
- Why this value: Pre-business refresh keeps AR collections state ready before office activity
- How to change: Edit cron expression in collections sync cron and redeploy
- Impact of changing: Later runs increase stale collections state during business hours
- Last changed: Unknown in git history; cataloged 2026-06-08 by BLOCK-13

### QBO sync queue runner cadence
- Current value: `"* * * * *"` (every minute, America/Chicago)
- Location: `apps/backend/src/cron/qbo-sync-queue-runner.ts`
- Why this value: Keeps outbound queue flowing while leaving room for retries and backoff
- How to change: Update `cron.schedule(...)` expression and redeploy backend
- Impact of changing: Slower cadence increases queue lag; faster cadence raises API pressure
- Last changed: Unknown in git history; cataloged 2026-06-08 by BLOCK-13

### QBO sync alerts retry cadence
- Current value: `"*/5 * * * *"` (every 5 minutes, enabled only when `QBO_SYNC_RETRY_ENABLED=true`)
- Location: `apps/backend/src/qbo/sync-alerts-cron.ts`
- Why this value: 5-minute retry bookkeeping balances responsiveness with noise control
- How to change: Edit cron expression in sync alerts cron and redeploy; keep env gate semantics
- Impact of changing: Faster loop escalates quicker; slower loop delays recovery/escalation
- Last changed: Unknown in git history; cataloged 2026-06-08 by BLOCK-13

### QBO forensic import runner cadence
- Current value: `QBO_FORENSIC_CRON` or default `"*/1 * * * *"` (every minute)
- Location: `apps/backend/src/cron/qbo-historical-import-runner.ts`
- Why this value: Frequent resume checks keep in-progress forensic imports moving
- How to change: Set `QBO_FORENSIC_CRON` (5-field cron) or change default in `forensicCronExpression()`
- Impact of changing: Slower cadence prolongs stalled imports; faster cadence increases runner overhead
- Last changed: Unknown in git history; cataloged 2026-06-08 by BLOCK-13

### Plaid daily sync cadence
- Current value: `"0 2 * * *"` (daily 02:00, America/Chicago)
- Location: `apps/backend/src/cron/plaid-daily-sync.ts`
- Why this value: Off-hours bank sync reduces daytime contention
- How to change: Update `CRON_EXPRESSION` constant and redeploy
- Impact of changing: Can shift freshness window for bank transaction ingestion
- Last changed: Unknown in git history; cataloged 2026-06-08 by BLOCK-13

### Reconciliation worker cadences
- Current value: QBO refdata `"35 */6 * * *"`, QBO transactional `"45 * * * *"`, Samsara static `"50 */12 * * *"`, CAP-15 identity `"55 * * * *"`
- Location: `apps/backend/src/cron/reconciliation-worker.cron.ts`
- Why this value: Staggers categories by risk profile and expected data volatility
- How to change: Adjust each `cron.schedule(...)` expression and redeploy
- Impact of changing: Too sparse misses drift sooner; too frequent increases reconciliation load
- Last changed: Unknown in git history; cataloged 2026-06-08 by BLOCK-13

---

## Rate limits

### QBO master push shared ceiling
- Current value: `QBO_MASTER_PUSH_RATE_LIMIT_PER_MIN = 100` (rolling 60-second window)
- Location: `apps/backend/src/sync/qbo-master-push-rate-limit.ts`
- Why this value: Keeps customers/vendors/accounts pushes below common QBO throttling behavior
- How to change: Update `QBO_MASTER_PUSH_RATE_LIMIT_PER_MIN` and verify related rate-limit tests
- Impact of changing: Higher value risks 429 spikes; lower value increases push backlog
- Last changed: Unknown in git history; cataloged 2026-06-08 by BLOCK-13

### Auth login IP limiter
- Current value: `5` attempts per `15` minutes, block for `60` minutes
- Location: `apps/backend/src/middleware/rate-limit.ts` (`loginIpLimiter`)
- Why this value: Limits brute-force attempts without over-blocking legitimate users
- How to change: Update `buildLimiter` arguments for `loginIpLimiter` and redeploy
- Impact of changing: Looser limits increase attack surface; tighter limits increase user lockouts
- Last changed: Unknown in git history; cataloged 2026-06-08 by BLOCK-13

### OTP start limiters (phone/email)
- Current value: `3` starts per `5` minutes for phone and email
- Location: `apps/backend/src/middleware/rate-limit.ts` (`otpPhoneStartLimiter`, `otpEmailStartLimiter`)
- Why this value: Controls OTP spam while preserving retry room for typos
- How to change: Update `points`/`durationSec` in both OTP start limiters and redeploy
- Impact of changing: Looser limits can increase SMS/email abuse costs
- Last changed: Unknown in git history; cataloged 2026-06-08 by BLOCK-13

### OTP verify code limiter
- Current value: `5` verification attempts per `10` minutes
- Location: `apps/backend/src/middleware/rate-limit.ts` (`otpVerifyLimiter`)
- Why this value: Limits code-guessing while allowing normal login recovery
- How to change: Update limiter `points`/`durationSec` in `otpVerifyLimiter` and redeploy
- Impact of changing: Too strict increases failed login friction; too loose weakens OTP security
- Last changed: Unknown in git history; cataloged 2026-06-08 by BLOCK-13

### Bulk action user limiter
- Current value: `1` request per `5` seconds per user (`BULK_RATE_LIMIT_INTERVAL_SEC = 5`)
- Location: `apps/backend/src/bulk/bulk-rate-limit.ts`
- Why this value: Prevents repeated bulk writes from flooding DB/audit paths
- How to change: Update `BULK_RATE_LIMIT_INTERVAL_SEC` and redeploy
- Impact of changing: Lower interval can overload bulk endpoints during rapid retries
- Last changed: Unknown in git history; cataloged 2026-06-08 by BLOCK-13

---

## Retry counts

### QBO client HTTP retries
- Current value: `MAX_RETRIES = 5` on retryable HTTP statuses with backoff `[1000, 2000, 4000, 8000, 16000]` ms
- Location: `apps/backend/src/integrations/qbo/qbo-client.ts`
- Why this value: Handles transient QBO throttling/outages without immediate hard failure
- How to change: Edit `MAX_RETRIES` and `RETRY_DELAYS_MS`, then run QBO client tests
- Impact of changing: Lower values surface failures sooner; higher values increase request latency
- Last changed: Unknown in git history; cataloged 2026-06-08 by BLOCK-13

### QBO sync inline retries
- Current value: `3` attempts with inline delays `[250, 1000, 4000]` ms
- Location: `apps/backend/src/qbo/sync-with-retry.ts`
- Why this value: Fast local retries for transient push failures before persisting alert records
- How to change: Update retry loop bound and `INLINE_RETRY_DELAYS_MS`
- Impact of changing: Fewer retries can increase alert volume; more retries can increase request time
- Last changed: Unknown in git history; cataloged 2026-06-08 by BLOCK-13

### QBO sync queue max attempts
- Current value: `max_attempts = 8` for new queue rows
- Location: `apps/backend/src/integrations/qbo/qbo-sync.service.ts` (`enqueueSyncJob`)
- Why this value: Gives durable retries before dead-lettering chronic failures
- How to change: Update inserted `max_attempts` default in queue enqueue path
- Impact of changing: Lower values dead-letter faster; higher values can delay operator escalation
- Last changed: Unknown in git history; cataloged 2026-06-08 by BLOCK-13

### Outbox processor max retries
- Current value: `MAX_RETRIES = 6`
- Location: `apps/backend/src/outbox/processor.ts`
- Why this value: Supports transient delivery failures while bounding poison-event churn
- How to change: Update `MAX_RETRIES` and verify backoff expectations
- Impact of changing: Lower value increases permanent failures; higher value can hide stuck handlers
- Last changed: Unknown in git history; cataloged 2026-06-08 by BLOCK-13

### Sync-run state-machine terminal threshold
- Current value: `MAX_SYNC_ATTEMPTS = 5`
- Location: `apps/backend/src/qbo/sync-state-machine.ts`
- Why this value: Standardizes dead-letter transition across sync run failures
- How to change: Update `MAX_SYNC_ATTEMPTS` and validate `transitionToFailed` behavior/tests
- Impact of changing: Alters when failed runs become terminal and alert-worthy
- Last changed: Unknown in git history; cataloged 2026-06-08 by BLOCK-13

---

## Timeouts

### Deep health Samsara request timeout
- Current value: `SAMSARA_TIMEOUT_MS = 3000`
- Location: `apps/backend/src/observability/health-deep.routes.ts`
- Why this value: Fast fail for dependency health checks to keep probes responsive
- How to change: Update `SAMSARA_TIMEOUT_MS` and verify health endpoint SLOs
- Impact of changing: Higher timeout can delay alerts; lower timeout can produce false degradations
- Last changed: Unknown in git history; cataloged 2026-06-08 by BLOCK-13

### FMCSA client timeout
- Current value: `FMCSA_TIMEOUT_MS = 30000`
- Location: `apps/backend/src/lib/fmcsa-client.ts`
- Why this value: FMCSA endpoints can be slow; 30s avoids premature aborts
- How to change: Update `FMCSA_TIMEOUT_MS` or pass explicit timeout to `withTimeout`
- Impact of changing: Lower timeout may drop valid responses; higher timeout can tie worker capacity
- Last changed: Unknown in git history; cataloged 2026-06-08 by BLOCK-13

### Anthropic compare timeout
- Current value: `timeoutMs = 30000` default
- Location: `apps/backend/src/safety/photo-comparison/anthropic-client.ts`
- Why this value: Balances LLM image latency with API responsiveness
- How to change: Change default `timeoutMs` in `createAnthropicClient`
- Impact of changing: Lower timeout increases false timeouts; higher timeout can hold request threads longer
- Last changed: Unknown in git history; cataloged 2026-06-08 by BLOCK-13

### QBO sync-run execution timeout
- Current value: `30000` ms per run execution wrapper
- Location: `apps/backend/src/integrations/qbo/qbo-sync-worker.ts` (`withTimeout(..., 30_000, ...)`)
- Why this value: Prevents stuck sync runs from blocking worker progression
- How to change: Update timeout passed to `withTimeout` in `processQboSyncRunsOnce`
- Impact of changing: Longer timeout can hide stuck handlers; shorter timeout increases retry churn
- Last changed: Unknown in git history; cataloged 2026-06-08 by BLOCK-13

---

## Cache TTLs

### Samsara cache tier 1 max age
- Current value: `TIER_1_REALTIME_MAX_AGE_MS = 5000`
- Location: `apps/backend/src/lib/cache-tiers.ts`
- Why this value: Keeps "live" telematics views near real time
- How to change: Update constant and re-evaluate cache hit/miss patterns
- Impact of changing: Larger TTL increases staleness; smaller TTL increases API traffic
- Last changed: Unknown in git history; cataloged 2026-06-08 by BLOCK-13

### Samsara cache tier 2 max age
- Current value: `TIER_2_30S_MAX_AGE_MS = 30000`
- Location: `apps/backend/src/lib/cache-tiers.ts`
- Why this value: Accepts short staleness for non-critical fleet views
- How to change: Update constant and verify tier routing behavior
- Impact of changing: Impacts freshness/performance balance for medium-priority reads
- Last changed: Unknown in git history; cataloged 2026-06-08 by BLOCK-13

### Samsara cache tier 3 max age
- Current value: `TIER_3_5MIN_MAX_AGE_MS = 300000`
- Location: `apps/backend/src/lib/cache-tiers.ts`
- Why this value: Suitable for summary/reporting paths
- How to change: Update constant and run cache-tier verification
- Impact of changing: Higher value increases stale analytics risk
- Last changed: Unknown in git history; cataloged 2026-06-08 by BLOCK-13

### Samsara cache tier 4 max age
- Current value: `TIER_4_15MIN_MAX_AGE_MS = 900000`
- Location: `apps/backend/src/lib/cache-tiers.ts`
- Why this value: Supports lowest-priority, cost-sensitive reads
- How to change: Update constant and verify downstream consumers still meet freshness needs
- Impact of changing: Too high may hide recent changes
- Last changed: Unknown in git history; cataloged 2026-06-08 by BLOCK-13

### Home reports in-memory cache TTL
- Current value: `HOME_REPORT_CACHE_MS = 30000`
- Location: `apps/backend/src/reports/library.routes.ts`
- Why this value: Reduces repeated heavy dashboard queries while keeping UI fresh
- How to change: Update `HOME_REPORT_CACHE_MS` and redeploy
- Impact of changing: Lower TTL increases DB query volume; higher TTL increases stale dashboard risk
- Last changed: Unknown in git history; cataloged 2026-06-08 by BLOCK-13

---

## Batch sizes

### QBO inbound sync worker batch size
- Current value: `processInboundSyncBatch(25)` every tick
- Location: `apps/backend/src/cron/qbo-inbound-sync.cron.ts`
- Why this value: Maintains steady ingest without long lock windows
- How to change: Change argument passed to `processInboundSyncBatch`
- Impact of changing: Larger batches increase per-tick lock time; smaller batches increase queue lag
- Last changed: Unknown in git history; cataloged 2026-06-08 by BLOCK-13

### QBO outbound sync worker batch size
- Current value: `processOutboundSyncWorkerTick(25)` per minute
- Location: `apps/backend/src/cron/qbo-sync-queue-runner.ts`
- Why this value: Keeps outbound throughput stable against API limits
- How to change: Change argument passed to `processOutboundSyncWorkerTick`
- Impact of changing: Larger batch may trigger more throttling; smaller batch slows drain
- Last changed: Unknown in git history; cataloged 2026-06-08 by BLOCK-13

### Recurring templates tick batch size
- Current value: `processRecurringTemplatesTick(50)`
- Location: `apps/backend/src/cron/recurring-templates.cron.ts`
- Why this value: Controls template materialization load per run
- How to change: Update the `50` argument in the recurring templates cron
- Impact of changing: Larger values can spike write load; smaller values can build backlog
- Last changed: Unknown in git history; cataloged 2026-06-08 by BLOCK-13

### Email queue claim batch size
- Current value: `LIMIT 50` claimed rows per tick
- Location: `apps/backend/src/email/cron.ts` (`claimQueuedEmailsBatch`)
- Why this value: Caps per-tick send workload and retry bookkeeping
- How to change: Update SQL `LIMIT` in `claimQueuedEmailsBatch`
- Impact of changing: Larger values may saturate provider limits; smaller values increase queue drain time
- Last changed: Unknown in git history; cataloged 2026-06-08 by BLOCK-13

---

## Reconciliation thresholds

### QBO refdata absolute drift thresholds
- Current value: Accounts/classes/items threshold `0`; customers/vendors threshold `1`
- Location: `apps/backend/src/reconciliation/reconciliation-worker.service.ts` (`QBO_REFDATA_MIRRORS`)
- Why this value: Enforces near-exact mirror on core dimensions with small tolerance for high-churn entities
- How to change: Adjust `threshold` values in `QBO_REFDATA_MIRRORS`
- Impact of changing: Higher thresholds can hide real drift; lower thresholds can increase findings noise
- Last changed: Unknown in git history; cataloged 2026-06-08 by BLOCK-13

### QBO transactional drift thresholds
- Current value: Ignore when `abs <= 10` and `pct <= 0.01`; critical when `abs > 20` and `pct > 0.02`
- Location: `apps/backend/src/reconciliation/reconciliation-worker.service.ts` (`transactionalDriftSeverity`)
- Why this value: Filters low-volume noise and escalates materially divergent transactional drift
- How to change: Update threshold comparisons in `transactionalDriftSeverity`
- Impact of changing: Lower thresholds increase alert volume; higher thresholds may delay incident detection
- Last changed: Unknown in git history; cataloged 2026-06-08 by BLOCK-13

### Samsara static reconciliation staleness/race guards
- Current value: remote count stale after `24` hours; webhook race guard `2` minutes
- Location: `apps/backend/src/reconciliation/reconciliation-worker.service.ts`
- Why this value: Prevents false drift while recent webhook projection may still be catching up
- How to change: Update stale-hour and race-guard constants/threshold snapshots in Samsara reconciliation logic
- Impact of changing: Tighter guards can create false positives; looser guards can delay drift detection
- Last changed: Unknown in git history; cataloged 2026-06-08 by BLOCK-13

### CAP-15 identity tolerance
- Current value: `0` tolerance (`cap15_zero_tolerance`)
- Location: `apps/backend/src/reconciliation/reconciliation-worker.service.ts` (`reconcileCap15IdentityForCompany`)
- Why this value: Identity mapping mismatches are treated as hard integrity violations
- How to change: Modify CAP-15 mismatch policy and finding threshold snapshot (business sign-off required)
- Impact of changing: Non-zero tolerance can hide broken driver/vendor identity chains
- Last changed: Unknown in git history; cataloged 2026-06-08 by BLOCK-13

---

## Alert thresholds

### Error digest threshold
- Current value: `ERROR_DIGEST_THRESHOLD` default `10`, evaluated every minute over a 5-minute buffer window
- Location: `apps/backend/src/cron/error-digest.cron.ts`
- Why this value: Catches sustained elevated error volume without firing on single spikes
- How to change: Set `ERROR_DIGEST_THRESHOLD` env var or change default in `thresholdPerMinute()`
- Impact of changing: Lower value increases warning volume; higher value delays anomaly detection
- Last changed: Unknown in git history; cataloged 2026-06-08 by BLOCK-13

### Deep health sync-age thresholds
- Current value: QBO max sync age `1h` (`QBO_MAX_SYNC_AGE_MS`), Plaid max sync age `24h` (`PLAID_MAX_SYNC_AGE_MS`)
- Location: `apps/backend/src/observability/health-deep.routes.ts`
- Why this value: Matches operational expectations for accounting and banking freshness
- How to change: Adjust `QBO_MAX_SYNC_AGE_MS` / `PLAID_MAX_SYNC_AGE_MS` constants
- Impact of changing: Looser thresholds can report healthy while data is stale
- Last changed: Unknown in git history; cataloged 2026-06-08 by BLOCK-13

### Healthz unresolved QBO alert queue threshold
- Current value: warning when unresolved `qbo.sync_alerts` count exceeds `100`
- Location: `apps/backend/src/health/health.routes.ts` (`checkQboSyncAlertsDepth`)
- Why this value: Flags growing unresolved sync issues before critical outage
- How to change: Update `if (c > 100)` threshold in `checkQboSyncAlertsDepth`
- Impact of changing: Lower threshold can be noisy; higher threshold can delay response
- Last changed: Unknown in git history; cataloged 2026-06-08 by BLOCK-13

### Healthz queued email depth threshold
- Current value: warning when queued `email.email_queue` count exceeds `1000`
- Location: `apps/backend/src/health/health.routes.ts` (`checkEmailQueueDepth`)
- Why this value: Indicates possible mail provider failure or processor lag
- How to change: Update `if (c > 1000)` threshold in `checkEmailQueueDepth`
- Impact of changing: Lower threshold can over-alert during campaigns; higher threshold can hide delivery delays
- Last changed: Unknown in git history; cataloged 2026-06-08 by BLOCK-13

### CSA BASIC alert thresholds
- Current value: `65` for unsafe/hos/crash; `80` for driver_fitness/controlled_substances_alcohol/vehicle_maintenance/hazmat
- Location: `apps/backend/src/compliance/csa-basic-projection.ts` (`CSA_THRESHOLDS`)
- Why this value: Mirrors CSA category-specific intervention bands used by compliance workflows
- How to change: Update `CSA_THRESHOLDS` and validate projected risk-band behavior
- Impact of changing: Changes alert_status assignment (`yes/no/inconclusive`) and mitigation prioritization
- Last changed: Unknown in git history; cataloged 2026-06-08 by BLOCK-13
